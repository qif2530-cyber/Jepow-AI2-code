@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cd /d d:\jepow-ai
cargo build --release --manifest-path native\jepow-engine\Cargo.toml
