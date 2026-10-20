"""aidetect: an offline, calibrated estimate of whether a text was written by AI."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("aidetect")
except PackageNotFoundError:  # running from a source tree that was never installed
    __version__ = "0.0.0+unknown"

__all__ = ["__version__"]
