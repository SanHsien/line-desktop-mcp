"""Bounded, source-read-only snapshots for LINE's encrypted SQLite database.

The returned database and WAL bytes remain encrypted.  This module does not
decrypt pages or open SQLite; callers hand the verified pair to the cipher
engine in a private, writable copy directory.  Stability here is observational
(two equal reads bracketing the pair), not a mathematically atomic snapshot.
"""

from __future__ import annotations

from dataclasses import dataclass
import datetime as dt
import hashlib
import os
from pathlib import Path
import stat
import struct
import time
from typing import Optional


MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_CAPTURE_ATTEMPTS = 3
_READ_CHUNK_BYTES = 1024 * 1024

_WAL_HEADER_BYTES = 32
_WAL_FRAME_HEADER_BYTES = 24
_WAL_VERSION = 3_007_000
_WAL_MAGIC_LITTLE_CHECKSUM = 0x377F0682
_WAL_MAGIC_BIG_CHECKSUM = 0x377F0683
_REPARSE_ATTRIBUTE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


class SnapshotError(Exception):
    """A fixed-code failure that never includes a source path or file content."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class _SourceChanged(Exception):
    """Internal retry signal for a source that changed during observation."""


@dataclass(frozen=True)
class _Observation:
    present: bool
    data: Optional[bytes]
    digest: Optional[bytes]
    size: Optional[int]
    identity: Optional[tuple[int, int]]
    mtime_ns: Optional[int]
    ctime_ns: Optional[int]


def _is_reparse(info: os.stat_result) -> bool:
    attributes = getattr(info, "st_file_attributes", 0)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & _REPARSE_ATTRIBUTE)


def _absolute_path(value: os.PathLike[str] | str) -> Path:
    try:
        raw = os.fspath(value)
        if not isinstance(raw, str) or not raw or "\0" in raw:
            raise ValueError
        return Path(os.path.abspath(raw))
    except (TypeError, ValueError, OSError):
        raise SnapshotError("INVALID_PATH") from None


def _path_components(path: Path):
    parts = path.parts
    if not parts:
        return
    current = Path(parts[0])
    yield current
    for part in parts[1:]:
        current = current / part
        yield current


def _assert_no_reparse_components(path: Path, *, final_may_be_missing: bool) -> None:
    components = tuple(_path_components(path))
    for index, component in enumerate(components):
        try:
            info = os.lstat(component)
        except FileNotFoundError:
            if final_may_be_missing and index == len(components) - 1:
                return
            raise SnapshotError("SOURCE_NOT_FOUND") from None
        except OSError:
            raise SnapshotError("SOURCE_IO_ERROR") from None
        if _is_reparse(info):
            raise SnapshotError("SOURCE_REPARSE")


def _identity(info: os.stat_result) -> tuple[int, int]:
    return int(info.st_dev), int(info.st_ino)


def _same_file(left: os.stat_result, right: os.stat_result) -> bool:
    return _identity(left) == _identity(right)


def _read_stats_stable(path_before: os.stat_result, opened_before: os.stat_result,
                       opened_after: os.stat_result, path_after: os.stat_result,
                       total: int) -> bool:
    # On Windows, stat-by-path and fstat-by-handle can expose different ctime
    # semantics (creation time versus metadata-change time).  Compare ctime only
    # within the same API, while identity, size, and mtime still agree across all
    # four observations.
    return (
        _same_file(path_before, opened_before)
        and _same_file(opened_before, opened_after)
        and _same_file(opened_after, path_after)
        and opened_before.st_size == opened_after.st_size == path_after.st_size == total
        and path_before.st_size == total
        and opened_before.st_mtime_ns == opened_after.st_mtime_ns == path_after.st_mtime_ns
        and path_before.st_mtime_ns == path_after.st_mtime_ns
        and path_before.st_ctime_ns == path_after.st_ctime_ns
        and opened_before.st_ctime_ns == opened_after.st_ctime_ns
    )


def _read_file(path: Path, *, optional: bool, keep_data: bool, max_bytes: int = MAX_FILE_BYTES) -> _Observation:
    _assert_no_reparse_components(path, final_may_be_missing=optional)
    try:
        path_before = os.lstat(path)
    except FileNotFoundError:
        if optional:
            return _Observation(False, None, None, None, None, None, None)
        raise _SourceChanged from None
    except OSError:
        raise SnapshotError("SOURCE_IO_ERROR") from None

    if _is_reparse(path_before):
        raise SnapshotError("SOURCE_REPARSE")
    if not stat.S_ISREG(path_before.st_mode):
        raise SnapshotError("SOURCE_NOT_FILE")
    if path_before.st_size > max_bytes:
        raise SnapshotError("SOURCE_TOO_LARGE")

    try:
        with path.open("rb", buffering=0) as stream:
            opened_before = os.fstat(stream.fileno())
            if not _same_file(path_before, opened_before):
                raise _SourceChanged
            if not stat.S_ISREG(opened_before.st_mode):
                raise SnapshotError("SOURCE_NOT_FILE")
            if opened_before.st_size > max_bytes:
                raise SnapshotError("SOURCE_TOO_LARGE")

            hasher = hashlib.sha256()
            if keep_data:
                data = stream.read(max_bytes + 1)
                hasher.update(data)
                total = len(data)
            else:
                data = None
                total = 0
                while True:
                    chunk = stream.read(min(_READ_CHUNK_BYTES, max_bytes + 1 - total))
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise SnapshotError("SOURCE_TOO_LARGE")
                    hasher.update(chunk)

            if total > max_bytes:
                raise SnapshotError("SOURCE_TOO_LARGE")
            opened_after = os.fstat(stream.fileno())
    except FileNotFoundError:
        raise _SourceChanged from None
    except PermissionError:
        raise SnapshotError("SOURCE_ACCESS_DENIED") from None
    except SnapshotError:
        raise
    except _SourceChanged:
        raise
    except OSError:
        raise SnapshotError("SOURCE_IO_ERROR") from None

    try:
        path_after = os.lstat(path)
    except FileNotFoundError:
        raise _SourceChanged from None
    except OSError:
        raise SnapshotError("SOURCE_IO_ERROR") from None

    if _is_reparse(path_after):
        raise SnapshotError("SOURCE_REPARSE")
    stable_stats = _read_stats_stable(
        path_before, opened_before, opened_after, path_after, total
    )
    if not stable_stats:
        raise _SourceChanged

    return _Observation(
        True,
        data,
        hasher.digest(),
        total,
        _identity(opened_after),
        int(opened_after.st_mtime_ns),
        int(opened_after.st_ctime_ns),
    )


def _observations_match(left: _Observation, right: _Observation) -> bool:
    return (
        left.present == right.present
        and left.size == right.size
        and left.identity == right.identity
        and left.mtime_ns == right.mtime_ns
        and left.ctime_ns == right.ctime_ns
        and left.digest == right.digest
    )


def _database_page_size(database: bytes) -> int:
    # wxSQLite3 AES128 leaves the standard page-size field at bytes 16..17 clear.
    if len(database) < 100:
        raise SnapshotError("DATABASE_HEADER_INVALID")
    encoded = int.from_bytes(database[16:18], "big")
    page_size = 65_536 if encoded == 1 else encoded
    if page_size < 512 or page_size > 65_536 or page_size & (page_size - 1):
        raise SnapshotError("DATABASE_HEADER_INVALID")
    if len(database) % page_size:
        raise SnapshotError("DATABASE_SIZE_INVALID")
    return page_size


def _wal_checksum(data: bytes | memoryview, *, big_endian: bool,
                  state: tuple[int, int] = (0, 0)) -> tuple[int, int]:
    if len(data) % 8:
        raise ValueError("checksum input must contain pairs of 32-bit words")
    byte_order = "big" if big_endian else "little"
    first, second = state
    for offset in range(0, len(data), 8):
        word1 = int.from_bytes(data[offset:offset + 4], byte_order)
        word2 = int.from_bytes(data[offset + 4:offset + 8], byte_order)
        first = (first + word1 + second) & 0xFFFFFFFF
        second = (second + word2 + first) & 0xFFFFFFFF
    return first, second


def _validate_wal(wal: Optional[bytes], database_page_size: int):
    if wal is None:
        return None, {
            "sourceState": "absent",
            "sourceBytes": 0,
            "returnedBytes": 0,
            "validFrames": 0,
            "committedFrames": 0,
            "tailBytesDiscarded": 0,
            "tailReason": None,
        }
    if not wal:
        return None, {
            "sourceState": "empty",
            "sourceBytes": 0,
            "returnedBytes": 0,
            "validFrames": 0,
            "committedFrames": 0,
            "tailBytesDiscarded": 0,
            "tailReason": None,
        }
    if len(wal) < _WAL_HEADER_BYTES:
        raise SnapshotError("WAL_HEADER_INVALID")

    magic, version, page_size = struct.unpack_from(">III", wal, 0)
    if magic not in (_WAL_MAGIC_LITTLE_CHECKSUM, _WAL_MAGIC_BIG_CHECKSUM):
        raise SnapshotError("WAL_HEADER_INVALID")
    if version != _WAL_VERSION:
        raise SnapshotError("WAL_HEADER_INVALID")
    if page_size < 512 or page_size > 65_536 or page_size & (page_size - 1):
        raise SnapshotError("WAL_HEADER_INVALID")
    if page_size != database_page_size:
        raise SnapshotError("WAL_PAGE_SIZE_MISMATCH")

    big_endian = magic == _WAL_MAGIC_BIG_CHECKSUM
    checksum = _wal_checksum(memoryview(wal)[:24], big_endian=big_endian)
    stored_header_checksum = struct.unpack_from(">II", wal, 24)
    if checksum != stored_header_checksum:
        raise SnapshotError("WAL_HEADER_INVALID")

    salt1, salt2 = struct.unpack_from(">II", wal, 16)
    frame_size = _WAL_FRAME_HEADER_BYTES + page_size
    offset = _WAL_HEADER_BYTES
    valid_frames = 0
    last_commit_frame = 0
    last_commit_db_pages = None
    tail_reason = None

    while len(wal) - offset >= frame_size:
        page_number, commit_db_pages, frame_salt1, frame_salt2, check1, check2 = (
            struct.unpack_from(">IIIIII", wal, offset)
        )
        if page_number == 0:
            tail_reason = "invalid_page_number"
            break
        if (frame_salt1, frame_salt2) != (salt1, salt2):
            tail_reason = "salt_mismatch"
            break
        frame = memoryview(wal)[offset:offset + frame_size]
        expected = _wal_checksum(
            frame[:8].tobytes() + frame[_WAL_FRAME_HEADER_BYTES:].tobytes(),
            big_endian=big_endian,
            state=checksum,
        )
        if expected != (check1, check2):
            tail_reason = "checksum_mismatch"
            break
        checksum = expected
        valid_frames += 1
        offset += frame_size
        if commit_db_pages:
            last_commit_frame = valid_frames
            last_commit_db_pages = commit_db_pages

    if tail_reason is None and offset != len(wal):
        tail_reason = "incomplete_frame"

    if last_commit_frame == 0:
        if len(wal) == _WAL_HEADER_BYTES:
            return None, {
                "sourceState": "header_only",
                "sourceBytes": len(wal),
                "returnedBytes": 0,
                "pageSize": page_size,
                "validFrames": 0,
                "committedFrames": 0,
                "tailBytesDiscarded": 0,
                "tailReason": None,
            }
        # A present WAL with frame bytes but no validated commit is ambiguous:
        # it may be torn/corrupt or use a legacy plaintext-checksum codec mode.
        raise SnapshotError("WAL_NO_VALID_COMMIT")

    commit_end = _WAL_HEADER_BYTES + last_commit_frame * frame_size
    if tail_reason is None and valid_frames > last_commit_frame:
        tail_reason = "uncommitted_tail"
    committed = wal[:commit_end]
    return committed, {
        "sourceState": "committed",
        "sourceBytes": len(wal),
        "returnedBytes": len(committed),
        "pageSize": page_size,
        "validFrames": valid_frames,
        "committedFrames": last_commit_frame,
        "commitDatabasePages": last_commit_db_pages,
        "tailBytesDiscarded": len(wal) - commit_end,
        "tailReason": tail_reason,
    }


def capture_snapshot(db_path: os.PathLike[str] | str):
    """Return ``(database_bytes, committed_wal_bytes_or_none, metadata)``.

    Files are opened only for binary reads.  Each candidate pair is bracketed as
    DB1, WAL1, WAL2, DB2 and accepted only when identities, timestamps, lengths,
    and SHA-256 digests match.  Three immediately consecutive attempts are made;
    there is deliberately no sleep or background retry.
    """
    database_path = _absolute_path(db_path)
    wal_path = Path(str(database_path) + "-wal")
    _assert_no_reparse_components(database_path, final_may_be_missing=False)
    _assert_no_reparse_components(wal_path, final_may_be_missing=True)

    for attempt in range(1, MAX_CAPTURE_ATTEMPTS + 1):
        capture_started_at = dt.datetime.now(dt.timezone.utc).isoformat()
        capture_clock = time.monotonic()
        try:
            database_first = _read_file(database_path, optional=False, keep_data=True)
            wal_first = _read_file(wal_path, optional=True, keep_data=True)
            wal_second = _read_file(wal_path, optional=True, keep_data=False)
            database_second = _read_file(database_path, optional=False, keep_data=False)
        except _SourceChanged:
            continue

        if not _observations_match(database_first, database_second):
            continue
        if not _observations_match(wal_first, wal_second):
            continue
        if database_first.data is None:
            raise SnapshotError("SOURCE_IO_ERROR")

        page_size = _database_page_size(database_first.data)
        committed_wal, wal_metadata = _validate_wal(wal_first.data, page_size)
        metadata = {
            "captureStartedAt": capture_started_at,
            "captureCompletedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "captureDurationMs": round((time.monotonic() - capture_clock) * 1000, 3),
            "snapshotKind": "observational_quiescent_copy",
            "atomicity": "not_mathematically_atomic",
            "sourceStable": True,
            "attempts": attempt,
            "databaseBytes": len(database_first.data),
            "databasePageSize": page_size,
            "wal": wal_metadata,
        }
        return database_first.data, committed_wal, metadata

    raise SnapshotError("SOURCE_BUSY")
