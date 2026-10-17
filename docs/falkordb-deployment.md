# FalkorDB connection settings for deployment

## Local Compose

The `falkordb` service in `compose.yaml` runs locally without ACL authentication or TLS. Leave these empty/default in root `.env`:

```dotenv
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_USERNAME=
FALKORDB_PASSWORD=
FALKORDB_SSL=false
```

Compose overrides host/port for the API container to `falkordb:6379` on the private Compose network.

## FalkorDB Cloud

Create/start an instance at the FalkorDB Cloud console. From that exact instance:

1. **Deployments → Instances → your instance → Connectivity**: copy endpoint host and port.
2. **Instance Details → Parameter**: read the FalkorDB User (documented default is `falkordb`) and reveal/copy its generated FalkorDB Password.
3. Note whether that instance's tier has TLS enabled. Current Cloud docs say Free instances do not have TLS; paid Startup+ plans include TLS.
4. Put those settings in your deployment provider's **server-side API environment secrets** (not a browser/Vite variable):

   ```dotenv
   FALKORDB_HOST=<host copied from Connectivity>
   FALKORDB_PORT=<port copied from Connectivity>
   FALKORDB_USERNAME=falkordb
   FALKORDB_PASSWORD=<password copied from Instance Details>
   FALKORDB_SSL=true
   ```

   Set `FALKORDB_SSL=false` if the instance says TLS is disabled. Do not copy these angle-bracket placeholders literally, and do not invent credentials. Ensure `FALKORDB_HOST` is the hostname alone, without a `redis://` URL prefix; port has its own variable.

Do not commit the password or send it in chat. Rotate/regenerate it through the cloud console if exposed. Run `/api/v1/health` after deployment to check connection status (health intentionally does not return credentials).

**Cloud Free-tier caution:** official Cloud docs currently state 100 MB RAM, no TLS, and inactive instances can stop after one day and be deleted after seven days; no backups/persistence are provided on that tier. It may be fine for a short demo, but should not be treated as durable production hosting. Select a tier/deployment with the persistence, backup, and availability guarantees needed for production.

References: [Cloud connect instructions](https://docs.falkordb.com/cloud/console/connect), [Cloud tier comparison](https://docs.falkordb.com/cloud/tiers/free), [official Python client](https://github.com/FalkorDB/falkordb-py).
