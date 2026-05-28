"""Persisted snapshot of the live DimOS MCP tool catalog.

The MCP server in DimOS exposes ``@skill``-decorated methods as JSON-RPC
tools. The broker discovers them via ``tools/list`` and stores them here
so the rest of the system has a stable inventory to reason about — most
importantly the RBAC layer (does every tool have a category? are any
ungated skills slipping through?), the frontend (which can render an
"available skills" panel without a live MCP connection), and audits.

This module is **not** the source of truth for what the robot can do — it
mirrors whatever the running blueprint exposes. The taxonomy in
:mod:`src.rbac.taxonomy` is the source of truth for *categorisation* of
those tools.
"""
