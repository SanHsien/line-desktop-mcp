"""Fail-closed local LINE executable compatibility verification.

This module only hashes a supplied executable through the snapshot module's
stable, no-reparse reader. It never opens LINE processes or reads their memory.
"""
from __future__ import annotations

import json
from pathlib import Path
import re

from line_encrypted_snapshot import SnapshotError, _SourceChanged, _read_file


MAX_CLIENT_BYTES = 128 * 1024 * 1024
MAX_MANIFEST_BYTES = 8 * 1024
MANIFEST_PATH = Path(__file__).with_name('line_client_builds.json')
_VERSION = re.compile(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z')
_SHA256 = re.compile(r'[0-9a-f]{64}\Z')


class ClientBuildError(Exception):
    """Public failures intentionally do not expose local paths or I/O details."""

    def __init__(self, code='LINE_BUILD_UNVERIFIED'):
        self.code = code
        super().__init__(code)


def _unverified():
    raise ClientBuildError('LINE_BUILD_UNVERIFIED')


def _read_manifest(manifest_path):
    try:
        observed = _read_file(Path(manifest_path), optional=False, keep_data=True,
                              max_bytes=MAX_MANIFEST_BYTES)
        if type(observed.data) is not bytes:
            _unverified()
        raw = json.loads(observed.data.decode('utf-8'))
    except (SnapshotError, _SourceChanged, OSError, TypeError, ValueError, UnicodeError, json.JSONDecodeError):
        _unverified()
    if type(raw) is not dict or set(raw) != {'v', 'builds'} or type(raw['v']) is not int or raw['v'] != 1:
        _unverified()
    builds = raw['builds']
    if type(builds) is not list or not 1 <= len(builds) <= 64:
        _unverified()
    accepted = []
    seen = set()
    for build in builds:
        if (type(build) is not dict or set(build) != {'version', 'bytes', 'sha256'}
                or type(build['version']) is not str or not _VERSION.fullmatch(build['version'])
                or type(build['bytes']) is not int or not 1 <= build['bytes'] <= MAX_CLIENT_BYTES
                or type(build['sha256']) is not str or not _SHA256.fullmatch(build['sha256'])):
            _unverified()
        identity = (build['bytes'], build['sha256'])
        if identity in seen:
            _unverified()
        seen.add(identity)
        accepted.append(dict(build))
    return raw['v'], accepted


def verify_client_build(path, *, manifest_path=MANIFEST_PATH):
    """Return safe build metadata only when ``path`` exactly matches the manifest.

    Root readers should call this before any LINE process or memory operation.
    The result deliberately excludes the supplied path and all source I/O data.
    """
    _manifest_version, builds = _read_manifest(manifest_path)
    try:
        observed = _read_file(Path(path), optional=False, keep_data=False,
                              max_bytes=MAX_CLIENT_BYTES)
        if (type(observed.digest) is not bytes or len(observed.digest) != 32
                or type(observed.size) is not int
                or not 1 <= observed.size <= MAX_CLIENT_BYTES):
            _unverified()
    except (SnapshotError, _SourceChanged, OSError, TypeError, ValueError):
        _unverified()
    digest = observed.digest.hex()
    for build in builds:
        if build['bytes'] == observed.size and build['sha256'] == digest:
            return {
                'verified': True,
                'version': build['version'],
                'buildRef': f'sha256:{digest}',
            }
    _unverified()
