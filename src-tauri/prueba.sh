#!/bin/bash
echo "=== Verificando archivos de icono ==="
echo "Contenido de src-tauri/icons/:"
ls -lh src-tauri/icons/ | grep -E "\.png|\.ico"

echo -e "\n=== Verificando tauri.conf.json ==="
cat src-tauri/tauri.conf.json | grep -A 10 "bundle"

echo -e "\n=== Buscando archivos viejos de iconos ==="
find src-tauri -name "*.png" -o -name "*.ico" | head -20
