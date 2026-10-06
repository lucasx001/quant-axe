"""Configure Hikyuu's official importer for the project-local data directory."""

from __future__ import annotations

from pathlib import Path

from hikyuu.data.hku_config_template import hdf5_template, import_config_template


def build_hikyuu_config(data_dir: Path) -> str:
    """Render the installed Hikyuu HDF5 template with day-bar defaults."""

    return hdf5_template.format(
        dir=data_dir.as_posix(),
        reload_time="00:00",
        quotation_server="ipc:///tmp/hikyuu_real.ipc",
        lazy_preload=False,
        day=True,
        week=False,
        month=False,
        quarter=False,
        halfyear=False,
        year=False,
        min1=False,
        min5=False,
        min15=False,
        min30=False,
        min60=False,
        hour2=False,
        timeline=False,
        trans=False,
        day_max=100000,
        week_max=100000,
        month_max=100000,
        quarter_max=100000,
        halfyear_max=100000,
        year_max=100000,
        min1_max=5120,
        min5_max=5120,
        min15_max=5120,
        min30_max=5120,
        min60_max=5120,
        hour2_max=5120,
        timeline_max=5120,
        trans_max=5120,
    )


def build_import_config(data_dir: Path) -> str:
    """Limit the initial official import to A-share daily bars and rights data."""

    text = import_config_template.format(dir=data_dir.as_posix())
    text = text.replace("min = True", "min = False")
    text = text.replace("min5 = True", "min5 = False")
    text = text.replace("enable = False\nuse_tdx_number", "enable = True\nuse_tdx_number")
    text = text.replace("[finance]\nenable = True", "[finance]\nenable = False")
    text = text.replace("[block]\nenable = True", "[block]\nenable = False")
    return text


def main() -> None:
    """Create importer configuration without overwriting user changes."""

    root = Path(__file__).resolve().parents[2]
    data_dir = root / ".hikyuu-data"
    config_dir = Path.home() / ".hikyuu"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "tmp").mkdir(exist_ok=True)
    config_dir.mkdir(exist_ok=True)
    paths = {
        config_dir / "hikyuu.ini": build_hikyuu_config(data_dir),
        config_dir / "importdata-gui.ini": build_import_config(data_dir),
    }
    for path, content in paths.items():
        if path.exists():
            raise FileExistsError(
                f"Hikyuu config already exists; inspect it before continuing: {path}"
            )
        path.write_text(content, encoding="utf-8")
        print(f"Created {path}")
    print(f"Hikyuu data directory: {data_dir}")


if __name__ == "__main__":
    main()
