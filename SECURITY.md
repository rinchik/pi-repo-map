# Security model

`pi-repo-map` is read-only. It scans only the current resolved workspace, ignores all symbolic links, performs no runtime networking, executes no subprocesses, and persists no repository contents. Its caches are memory-only and process-scoped.

Repository-derived prompt output is untrusted contextual data and is escaped before rendering. Repository configuration is validated and cannot override hard resource ceilings.

This extension runs inside the Pi process and is not an operating-system security boundary. Users handling sensitive credentials should still run Pi with least privilege and avoid exposing production credentials to the Pi process.
