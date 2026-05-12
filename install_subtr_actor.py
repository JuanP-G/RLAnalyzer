"""
install_subtr_actor.py
Compila e instala subtr-actor-py desde el codigo fuente usando maturin,
evitando el bug de puccinialin (el build backend por defecto del paquete).
"""

import subprocess
import sys
import os
import urllib.request
import zipfile
import glob
import shutil

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(BASE_DIR, ".build_subtr_actor")


def run(cmd, cwd=None, check=True):
    print(f"  > {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if check and result.returncode != 0:
        raise RuntimeError(f"Comando fallido con codigo {result.returncode}")
    return result


def check_cargo():
    """Verifica que cargo (Rust) esta disponible y lo añade al PATH si es necesario."""
    import shutil

    # 1. Intentar en el PATH actual
    if shutil.which("cargo"):
        result = subprocess.run(["cargo", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  Cargo encontrado en PATH: {result.stdout.strip()}")
            return True

    # 2. Buscar en la ubicacion por defecto de rustup (~/.cargo/bin)
    candidates = [
        os.path.join(os.path.expanduser("~"), ".cargo", "bin", "cargo.exe"),
        os.path.join(os.environ.get("USERPROFILE", ""), ".cargo", "bin", "cargo.exe"),
    ]
    for cargo_path in candidates:
        if os.path.exists(cargo_path):
            cargo_bin = os.path.dirname(cargo_path)
            print(f"  Cargo encontrado en: {cargo_path}")
            print(f"  Añadiendo {cargo_bin} al PATH de este proceso...")
            os.environ["PATH"] = cargo_bin + os.pathsep + os.environ.get("PATH", "")
            os.environ["CARGO_HOME"] = os.path.join(os.path.expanduser("~"), ".cargo")
            result = subprocess.run(["cargo", "--version"], capture_output=True, text=True)
            if result.returncode == 0:
                print(f"  Cargo OK: {result.stdout.strip()}")
                return True

    print("  ERROR: cargo no encontrado en el sistema.")
    print("  Instala Rust desde https://rustup.rs/ o con: winget install Rustlang.Rustup")
    print("  Luego abre una NUEVA terminal y vuelve a ejecutar setup.bat")
    return False


def check_already_installed():
    """Comprueba si subtr_actor ya esta instalado."""
    result = subprocess.run(
        [sys.executable, "-c", "import subtr_actor; print('ok')"],
        capture_output=True, text=True
    )
    return result.returncode == 0


def main():
    print()
    print("=== Instalando subtr-actor-py (compilando desde fuente) ===")
    print()

    if check_already_installed():
        print("subtr-actor-py ya esta instalado. Saltando.")
        return True

    # 1. Verificar Rust/cargo
    print("[1/5] Verificando Rust...")
    if not check_cargo():
        return False

    # 2. Instalar maturin
    print()
    print("[2/5] Instalando maturin (compilador de extensiones Rust/Python)...")
    run([sys.executable, "-m", "pip", "install", "maturin"])

    # 3. Descargar codigo fuente de subtr-actor
    print()
    print("[3/5] Descargando codigo fuente de subtr-actor desde GitHub...")
    os.makedirs(BUILD_DIR, exist_ok=True)
    zip_path = os.path.join(BUILD_DIR, "subtr-actor.zip")

    url = "https://github.com/rlrml/subtr-actor/archive/refs/heads/master.zip"
    print(f"  Descargando {url}")
    try:
        urllib.request.urlretrieve(url, zip_path)
    except Exception as e:
        print(f"  ERROR descargando: {e}")
        return False

    # 4. Extraer
    print()
    print("[4/5] Extrayendo y compilando (puede tardar 5-10 minutos)...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(BUILD_DIR)
    os.remove(zip_path)

    # Encontrar el directorio extraido
    subdirs = [d for d in os.listdir(BUILD_DIR) if d.startswith("subtr-actor")]
    if not subdirs:
        print("  ERROR: No se encontro el directorio extraido.")
        return False

    repo_dir    = os.path.join(BUILD_DIR, subdirs[0])
    python_dir  = os.path.join(repo_dir, "python")

    if not os.path.exists(python_dir):
        print(f"  ERROR: No se encontro la carpeta python/ en {repo_dir}")
        return False

    print(f"  Compilando en: {python_dir}")
    print("  (Esto tardara varios minutos la primera vez...)")
    run(
        [sys.executable, "-m", "maturin", "build", "--release", "-i", sys.executable],
        cwd=python_dir
    )

    # 5. Instalar el wheel generado
    # maturin coloca el wheel en target/wheels/ (relativo al workspace root)
    wheels = (
        glob.glob(os.path.join(repo_dir, "target", "wheels", "*.whl")) +
        glob.glob(os.path.join(python_dir, "target", "wheels", "*.whl"))
    )

    if not wheels:
        print("  ERROR: No se encontro el archivo .whl compilado.")
        print(f"  Busca manualmente en {repo_dir}")
        return False

    wheel = wheels[0]
    print()
    print(f"[5/5] Instalando {os.path.basename(wheel)}...")
    run([sys.executable, "-m", "pip", "install", wheel])

    # Limpiar archivos temporales
    print()
    print("Limpiando archivos temporales...")
    shutil.rmtree(BUILD_DIR, ignore_errors=True)

    # Verificar instalacion
    if check_already_installed():
        print()
        print("subtr-actor-py instalado correctamente!")
        return True
    else:
        print()
        print("ERROR: La instalacion no se pudo verificar.")
        return False


if __name__ == "__main__":
    ok = main()
    print()
    sys.exit(0 if ok else 1)
