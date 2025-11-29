#!/bin/bash
# Build script for Lambda deployment package
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_ZIP="$SCRIPT_DIR/lambda_package.zip"

echo "Building Lambda deployment package..."

# Clean up
rm -rf "$BUILD_DIR"
rm -f "$OUTPUT_ZIP"

# Create build directory
mkdir -p "$BUILD_DIR"

# Install dependencies to build directory
echo "Installing dependencies..."
pip install -r "$SCRIPT_DIR/requirements.txt" -t "$BUILD_DIR" --quiet --upgrade

# Copy handler code
echo "Copying handler code..."
cp -r "$SCRIPT_DIR/handlers" "$BUILD_DIR/"

# Create zip file
echo "Creating zip file..."
cd "$BUILD_DIR"
zip -r "$OUTPUT_ZIP" . -x "*.pyc" -x "__pycache__/*" -x "*.dist-info/*" -x "*.egg-info/*"

# Clean up build directory
rm -rf "$BUILD_DIR"

echo "Build complete: $OUTPUT_ZIP"
ls -lh "$OUTPUT_ZIP"
