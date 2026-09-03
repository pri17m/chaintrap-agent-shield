# Data Model: Scan Efficiency Pass

## InventoryItem (extended)

| Field | Persist? | Notes |
|-------|----------|-------|
| key, kind, path, hash | yes | unchanged |
| packageName, version, ecosystem, mcpId, workspaceRoot | yes | unchanged |
| content | **no** | ephemeral UTF-8 body for current analyze pass |

## BaselineSnapshot

Unchanged structure; items must be `persistableItem` clones without `content`.

## AnalyzeOptions

```ts
{ skipKeys?: Set<string> }
```

Keys present in skip set are omitted from package OSV queue and skill/rule heuristics.
