"""Inspect and freeze historical data imported with Hikyuu's official tools."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from configparser import ConfigParser
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any
from uuid import uuid4


REQUIRED_FILES = ("stock.db", "sh_day.h5", "sz_day.h5")


class HikyuuDataError(RuntimeError):
    """The configured Hikyuu dataset cannot be trusted or read."""


def default_config_file() -> Path:
    """Return the explicitly configured or official default Hikyuu config."""

    configured = os.environ.get("HIKYUU_CONFIG_FILE", "").strip()
    return Path(configured).expanduser() if configured else Path.home() / ".hikyuu" / "hikyuu.ini"


def read_hikyuu_config(config_file: Path) -> tuple[ConfigParser, Path]:
    """Read a Hikyuu HDF5 configuration and its data directory."""

    if not config_file.is_file():
        raise HikyuuDataError(f"Hikyuu config not found: {config_file}")
    config = ConfigParser()
    config.read(config_file, encoding="utf-8")
    if config.get("kdata", "type", fallback="").lower() != "hdf5":
        raise HikyuuDataError("Only Hikyuu HDF5 imports are supported in this integration")
    data_dir = Path(config.get("hikyuu", "datadir")).expanduser().resolve()
    if not data_dir.is_dir():
        raise HikyuuDataError(f"Hikyuu data directory not found: {data_dir}")
    return config, data_dir


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _source_files(config: ConfigParser) -> dict[str, Path]:
    sources = {"stock.db": Path(config.get("baseinfo", "db")).expanduser()}
    for key, value in config.items("kdata"):
        if key == "type":
            continue
        path = Path(value).expanduser()
        if path.is_file():
            sources[path.name] = path
    missing = [
        name for name in REQUIRED_FILES if name not in sources or not sources[name].is_file()
    ]
    if missing:
        raise HikyuuDataError(f"Hikyuu import is missing required files: {', '.join(missing)}")
    if any(sources[name].stat().st_size == 0 for name in REQUIRED_FILES):
        raise HikyuuDataError("Hikyuu import has empty required files")
    return sources


def _copy_snapshot_files(sources: dict[str, Path], destination: Path) -> dict[str, Any]:
    """Copy only stable imported files and record their checksums."""

    files: dict[str, Any] = {}
    for name, source in sorted(sources.items()):
        before = source.stat()
        target = destination / name
        shutil.copy2(source, target)
        after = source.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise HikyuuDataError(f"Import changed during snapshot copy: {source}")
        files[name] = {"size": target.stat().st_size, "sha256": _sha256(target)}
    return files


def _write_snapshot_config(config: ConfigParser, destination: Path) -> Path:
    """Point Hikyuu at the frozen files instead of the live importer output."""

    for section in ("baseinfo", "block"):
        if config.get(section, "type", fallback="").lower() == "sqlite3":
            config.set(section, "db", (destination / "stock.db").as_posix())
    for key, value in config.items("kdata"):
        if key != "type":
            config.set("kdata", key, (destination / Path(value).name).as_posix())
    config.set("hikyuu", "datadir", destination.as_posix())
    config.set("hikyuu", "tmpdir", (destination / "tmp").as_posix())
    config_path = destination / "hikyuu.ini"
    with config_path.open("w", encoding="utf-8") as stream:
        config.write(stream)
    return config_path


def create_snapshot(config_file: Path, snapshot_root: Path) -> dict[str, Any]:
    """Copy imported HDF5/SQLite data into a versioned, checksum-verified snapshot."""

    config, _ = read_hikyuu_config(config_file)
    sources = _source_files(config)
    snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    destination = snapshot_root / snapshot_id
    destination.mkdir(parents=True)
    (destination / "tmp").mkdir()
    files = _copy_snapshot_files(sources, destination)
    frozen_config = _write_snapshot_config(config, destination)
    files[frozen_config.name] = {
        "size": frozen_config.stat().st_size,
        "sha256": _sha256(frozen_config),
    }

    manifest = {
        "snapshot_id": snapshot_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": "hikyuu.official_importer",
        "hikyuu_version": version("hikyuu"),
        "files": files,
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    snapshot_root.mkdir(parents=True, exist_ok=True)
    pointer = snapshot_root / "latest.json"
    temporary = snapshot_root / f".latest-{snapshot_id}.json"
    temporary.write_text(json.dumps({"snapshot_id": snapshot_id}), encoding="utf-8")
    temporary.replace(pointer)
    return manifest


def active_snapshot_root() -> Path:
    """Find the snapshot collection configured for the backend."""

    configured = os.environ.get("HIKYUU_SNAPSHOT_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    _, data_dir = read_hikyuu_config(default_config_file())
    return data_dir / "snapshots"


def verify_snapshot(
    snapshot_root: Path, snapshot_id: str | None = None
) -> tuple[Path, dict[str, Any]]:
    """Reject missing or changed snapshots before a backtest uses them."""

    if snapshot_id is None:
        pointer = snapshot_root / "latest.json"
        if not pointer.is_file():
            raise HikyuuDataError("No Hikyuu data snapshot exists yet")
        snapshot_id = json.loads(pointer.read_text(encoding="utf-8"))["snapshot_id"]
    if Path(snapshot_id).name != snapshot_id or snapshot_id in {".", ".."}:
        raise HikyuuDataError("Invalid Hikyuu snapshot ID")
    destination = snapshot_root / snapshot_id
    manifest_file = destination / "manifest.json"
    if not manifest_file.is_file():
        raise HikyuuDataError(f"Hikyuu snapshot manifest missing: {snapshot_id}")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("snapshot_id") != snapshot_id:
        raise HikyuuDataError("Hikyuu snapshot ID does not match its manifest")
    try:
        installed_version = version("hikyuu")
    except PackageNotFoundError as error:
        raise HikyuuDataError("Hikyuu is not installed") from error
    if manifest.get("hikyuu_version") != installed_version:
        raise HikyuuDataError("Hikyuu version differs from the snapshot's engine version")
    files = manifest.get("files", {})
    if not set(REQUIRED_FILES + ("hikyuu.ini",)).issubset(files):
        raise HikyuuDataError("Hikyuu snapshot is missing required file checksums")
    for name, expected in files.items():
        if Path(name).name != name or name in {".", ".."}:
            raise HikyuuDataError("Hikyuu snapshot manifest contains an invalid filename")
        path = destination / name
        if (
            not path.is_file()
            or path.stat().st_size != expected["size"]
            or _sha256(path) != expected["sha256"]
        ):
            raise HikyuuDataError(f"Hikyuu snapshot file changed or disappeared: {name}")
    return destination, manifest


def hikyuu_status() -> dict[str, Any]:
    """Report installation and immutable-data readiness without touching live providers."""

    try:
        installed_version = version("hikyuu")
    except PackageNotFoundError:
        return {"status": "unavailable", "reason": "hikyuu_not_installed"}
    try:
        snapshot_root = active_snapshot_root()
        _, manifest = verify_snapshot(snapshot_root)
    except (HikyuuDataError, KeyError, ValueError) as error:
        return {"status": "incomplete", "hikyuu_version": installed_version, "reason": str(error)}
    return {
        "status": "snapshot_ready",
        "hikyuu_version": installed_version,
        "snapshot_id": manifest["snapshot_id"],
        "files": {name: item["size"] for name, item in manifest["files"].items()},
        "coverage_verified": False,
    }
