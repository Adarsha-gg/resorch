#!/bin/bash
# setup_vggt.sh - Setup a python environment for VGGT and MASt3R experiments.

set -e

REPO_ROOT=$(pwd)
VGGT_ROOT="${REPO_ROOT}/research/models/vggt"
MAST3R_ROOT="${REPO_ROOT}/research/models/mast3r"
VENV_PATH="${REPO_ROOT}/research/vggt_venv"

# Use python 3.11 since VGGT requires >=3.10
PYTHON_EXE=$(which python3.11)
if [ -z "${PYTHON_EXE}" ]; then
    echo "Error: python3.11 not found. Please install it."
    exit 1
fi

echo "Creating virtual environment at ${VENV_PATH} using ${PYTHON_EXE}..."
"${PYTHON_EXE}" -m venv "${VENV_PATH}"

echo "Activating virtual environment..."
source "${VENV_PATH}/bin/activate"

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing VGGT dependencies..."
pip install -r "${VGGT_ROOT}/requirements.txt"

echo "Installing MASt3R/DUSt3R dependencies..."
pip install -r "${MAST3R_ROOT}/requirements.txt"
pip install -r "${MAST3R_ROOT}/dust3r/requirements.txt"
# Optional DUSt3R deps
# pip install -r "${MAST3R_ROOT}/dust3r/requirements_optional.txt"

echo "Installing VGGT package in editable mode..."
pip install -e "${VGGT_ROOT}"

echo "Installing MASt3R package in editable mode..."
# MASt3R doesn't have a pyproject.toml at root, but we can add its paths to PYTHONPATH or install its submodules
# For now, we'll just ensure dependencies are there.

echo "Setup complete. To use the environment, run:"
echo "source research/vggt_venv/bin/activate"
