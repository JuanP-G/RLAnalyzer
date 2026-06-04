"""
watcher.py — RLAnalyzer
Vigila la carpeta de replays y procesa automáticamente
los nuevos archivos .replay que aparezcan.
"""

import logging
import time
import os
from pathlib import Path
from threading import Thread

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from settings_store import get_replays_folder

logger = logging.getLogger(__name__)

# Cola de archivos pendientes de procesar (compartida con main.py)
_pending_files: list[str] = []
_processed_files: set[str] = set()


def get_pending_and_clear() -> list[str]:
    """Devuelve los archivos pendientes y vacía la cola."""
    global _pending_files
    files = list(_pending_files)
    _pending_files.clear()
    return files


def mark_processed(file_path: str):
    _processed_files.add(file_path)


class ReplayHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        path = event.src_path
        if path.endswith(".replay"):
            logger.info(f"Nuevo replay detectado: {path}")
            # Esperar un momento a que el archivo termine de escribirse
            time.sleep(2)
            if path not in _processed_files:
                _pending_files.append(path)

    def on_moved(self, event):
        """RL a veces mueve archivos .tmp → .replay al terminar."""
        if not event.is_directory and event.dest_path.endswith(".replay"):
            logger.info(f"Replay movido: {event.dest_path}")
            time.sleep(2)
            if event.dest_path not in _processed_files:
                _pending_files.append(event.dest_path)


class ReplayWatcher:
    def __init__(self):
        self.observer = Observer()
        self._started = False

    def start(self):
        folder = get_replays_folder()
        if not folder or not os.path.exists(folder):
            logger.warning(
                f"Carpeta de replays no encontrada: {folder}\n"
                "Configúrala en la pantalla de Ajustes."
            )
            return

        handler = ReplayHandler()
        self.observer.schedule(handler, folder, recursive=False)
        self.observer.start()
        self._started = True
        logger.info(f"Watcher activo en: {folder}")

    def stop(self):
        if self._started:
            self.observer.stop()
            self.observer.join()
            self._started = False
            logger.info("Watcher detenido")

    def restart(self):
        """Reinicia el watcher con la carpeta actual. Un Observer no se puede
        re-arrancar tras stop(), así que se crea uno nuevo."""
        self.stop()
        self.observer = Observer()
        self.start()


def scan_existing_replays(processed_paths: set[str]) -> list[str]:
    """
    Escanea la carpeta de replays buscando archivos .replay
    que aún no hayan sido procesados. Útil al arrancar la app.
    """
    folder = Path(get_replays_folder())
    if not folder.exists():
        return []

    new_files = []
    for replay_file in sorted(folder.glob("*.replay"), key=os.path.getmtime):
        path_str = str(replay_file)
        if path_str not in processed_paths:
            new_files.append(path_str)

    return new_files
