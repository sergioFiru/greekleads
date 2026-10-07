# Railway build for the GreekLeads MCP server.
#
# ⚠️ BUILD CONTEXT MUST BE THE REPOSITORY ROOT, not mcp/.
# The server imports three modules from web/lib — the same query builders the
# website uses, so the two cannot drift — and a context of just mcp/ cannot see
# them. In Railway: Root Directory = the repo root, Dockerfile Path =
# mcp/Dockerfile.
#
# There is no compile step: tsx runs the TypeScript directly. That is why tsx
# is a runtime dependency rather than a dev one — `npm ci --omit=dev` would
# otherwise drop the thing that actually starts the server.

FROM node:22-alpine

WORKDIR /app

# Dependencies first, so a code change does not re-run the install layer.
COPY mcp/package.json mcp/package-lock.json ./mcp/
RUN cd mcp && npm ci --omit=dev

# The shared modules. Copied before the app so that editing the server does not
# invalidate this layer either.
COPY web/lib/searchQuery.ts web/lib/nace.ts web/lib/registryText.ts ./web/lib/

COPY mcp/src ./mcp/src
COPY mcp/tsconfig.json ./mcp/

WORKDIR /app/mcp

ENV NODE_ENV=production
# Railway injects PORT; 8080 is only the local default.
EXPOSE 8080

# node + the tsx CLI rather than `npx tsx`: npx would consult the registry on a
# cache miss, which is not something a container start should depend on.
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/http.ts"]
