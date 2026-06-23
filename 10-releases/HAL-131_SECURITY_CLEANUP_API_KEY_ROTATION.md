# HAL-131 Security Cleanup and Exposed Provider API Key Rotation

## Goal

Close the immediate security follow-up after a local editor/provider API key was
visible in a screenshot.

## Current Status

Local cleanup is complete. Provider-side key rotation is still required.

## Local Cleanup Completed

- `C:\Users\User\.continue\config.yaml` now references `${DO_AI_API_KEY}`
  instead of a plaintext provider key.
- Recent local Continue config backup files were sanitized to use the same
  environment-variable placeholder.
- Repo scan found no committed `doo_v1_...` provider key pattern.
- No local editor config file was committed to this repository.

## Manual Provider Rotation Required

Complete these steps in the provider dashboard:

1. Open the provider dashboard where the exposed key was created.
2. Revoke or delete the exposed key.
3. Create a new key only if the editor still needs this provider.
4. Store the new value as `DO_AI_API_KEY` in a local environment variable or an
   approved secret store.
5. Restart VS Code/Continue so the environment variable is picked up.
6. Do not paste the new key into chat, Linear, docs, screenshots, or terminal
   output.

## Local Verification Commands

Use commands that only print booleans/counts, never the secret value.

```powershell
$config = 'C:\Users\User\.continue\config.yaml'
$text = Get-Content -Raw -LiteralPath $config
[pscustomobject]@{
  UsesEnvPlaceholder = ($text -match '\$\{DO_AI_API_KEY\}')
  ContainsLikelyDoKey = ($text -match 'doo_v1_[A-Za-z0-9]+')
}
```

Repo scan:

```powershell
rg -n --hidden --glob '!node_modules/**' --glob '!.next/**' --glob '!.pglite-data/**' --glob '!.pglite-data-broken-*/**' "doo_v1_|DO_AI_API_KEY|apiKey:" .
```

Expected repo result:

- No plaintext provider key.
- No committed editor config file.

## Acceptance Decision

Do not mark HAL-131 Done until the provider-side old key is confirmed revoked or
rotated. Local cleanup alone is not enough because the screenshot already
exposed the original key.
