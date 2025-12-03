#!/bin/bash
# Build script for Lambda deployment package using uv
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
VENV_DIR="$SCRIPT_DIR/.venv"
OUTPUT_ZIP="$SCRIPT_DIR/lambda_package.zip"

echo "Building Lambda deployment package with uv..."

# Clean up
rm -rf "$BUILD_DIR"
rm -f "$OUTPUT_ZIP"

# Create build directory
mkdir -p "$BUILD_DIR"

# Create virtual environment with uv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment with uv..."
    uv venv "$VENV_DIR" --python 3.11
fi

# Install dependencies to virtual environment
echo "Installing dependencies with uv..."
uv pip install -r "$SCRIPT_DIR/requirements.txt" --python "$VENV_DIR/bin/python"

# Copy site-packages to build directory
echo "Copying dependencies to build directory..."
cp -r "$VENV_DIR/lib/python3.11/site-packages/"* "$BUILD_DIR/"

# Copy handler code
echo "Copying handler code..."
cp -r "$SCRIPT_DIR/handlers" "$BUILD_DIR/"

# Create zip file
echo "Creating zip file..."
cd "$BUILD_DIR"
zip -r "$OUTPUT_ZIP" . -x "*.pyc" -x "__pycache__/*" -x "*.dist-info/*" -x "*.egg-info/*" -q

# Clean up build directory
rm -rf "$BUILD_DIR"

echo "Build complete: $OUTPUT_ZIP"
ls -lh "$OUTPUT_ZIP"
echo ""
echo "Virtual environment preserved at: $VENV_DIR"
echo "To rebuild after dependency changes, delete .venv and run ./build.sh again"
