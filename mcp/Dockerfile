# Railway build. Deliberately copies BOTH mcp/ and web/lib/ — the server imports
# the website's own query builders (see tsconfig paths), so a build context of
# just mcp/ would fail to resolve @/lib/searchQuery.
#
# Set the Railway service root to the REPOSITORY root, not mcp/.
FROM node:22-alpine

WORKDIR /app

COPY mcp/package.json mcp/package-lock.json* ./mcp/
RUN cd mcp && npm ci --omit=dev || npm install --omit=dev

# The shared, dependency-free modules the MCP reuses.
COPY web/lib ./web/lib
COPY mcp ./mcp

WORKDIR /app/mcp

# tsx runs the TypeScript directly. No build step, which keeps the shared
# web/lib imports working without wrestling a second tsconfig rootDir.
RUN npm install tsx

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/http.ts"]
