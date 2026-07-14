# Vendored hyphy-analyses batch files (for WASM execution)

Custom HyPHY analyses that are NOT part of core hyphy's bundled `/res/` library
are vendored here so the WASM engine (Aioli) can mount them at runtime.

All dependencies these batch files `LoadFunctionLibrary` (libv3/*, SelectionAnalyses/modules/*,
TemplateModels/*) are already present in the packed hyphy.data image, so only the
top-level analysis `.bf` needs to be mounted.

## Contents
- `NucleotideNonREV/NRM.bf` — Non-Reversibility Model (directional evolution).
  Source: https://github.com/veg/hyphy-analyses @ 3b8fefe (`NucleotideNonREV/NRM.bf`)
