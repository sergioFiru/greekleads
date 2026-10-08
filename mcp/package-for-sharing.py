#!/usr/bin/env python3
"""
Build a self-contained copy of the MCP server to hand to someone else.

WHY NOT JUST SEND THE REPO
--------------------------
The repo contains scripts/.env — live Stripe, Clerk, OpenRouter and superuser
Postgres credentials. This copies only the files the server actually needs and
deliberately does NOT include any .env.

WHAT GOES IN
  mcp/src, mcp/package.json, mcp/package-lock.json, mcp/tsconfig.json
  web/lib/{searchQuery,nace,registryText}.ts   <- the three shared modules
  SETUP.md                                      <- what they have to do

The relative layout is preserved, because src/tools.ts imports
`../../web/lib/searchQuery.js` — flatten it and the server will not start.

node_modules is NOT copied: it is large, platform-specific, and `npm install`
on their machine is both smaller and more correct.

USAGE
  python mcp/package-for-sharing.py             # builds ../greekleads-mcp-share
  python mcp/package-for-sharing.py --out PATH
"""
import argparse
import io
import os
import shutil
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SETUP = """# GreekLeads MCP — setup

An MCP server over the Greek business registry (ΓΕΜΗ): 1,69M companies and
2,1M people. Five tools, usable from Claude Desktop or Claude Code.

## 1. Install

You need Node 20 or newer.

```bash
cd mcp
npm install
```

## 2. Check it works

```bash
DATABASE_URL="<the connection string you were sent>" npx tsx src/smoke.ts
```

It should print eight checks and `ALL CHECKS PASSED`. If it cannot connect,
the connection string is wrong or your network blocks the database port.

## 3. Add it to Claude Desktop

Edit `%APPDATA%\\Claude\\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and
add an entry inside `mcpServers`:

```json
"greekleads": {
  "command": "node",
  "args": [
    "<ABSOLUTE PATH>/mcp/node_modules/tsx/dist/cli.mjs",
    "<ABSOLUTE PATH>/mcp/src/stdio.ts"
  ],
  "env": {
    "DATABASE_URL": "<the connection string you were sent>"
  }
}
```

Use **absolute** paths, and `node` with the local tsx CLI rather than
`npx tsx` — Desktop launches the server from a working directory of its own
choosing, and npx may not find the local tsx from there.

Then **quit Claude Desktop completely** (on Windows it keeps running in the
system tray) and reopen it.

## 4. Use it

Ask it to call `describe_dataset` first. Several fields do not mean what their
names suggest — `prefecture_descr` is unaccented, `municipality_descr` is two
fields glued together, `'Inadequate Info'` is a real value rather than NULL,
and about 11.000 companies that look active have never traded. The tool
explains all of it.

Then try things like:
- "How many active ΙΚΕ in Θεσσαλονίκη have a website?"
- "Find hotels in Crete with email addresses"
- "Which sectors are growing fastest in Greece?"

## Notes

- The connection string is **read-only**. Nothing you do can change the data.
- The database is shared with a live website, so please do not hammer it.
- It holds real people's names, emails and phone numbers from the public
  registry. Treat it accordingly.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(REPO), 'greekleads-mcp-share'))
    args = ap.parse_args()
    out = os.path.abspath(args.out)

    if os.path.exists(out):
        shutil.rmtree(out)

    os.makedirs(os.path.join(out, 'mcp'), exist_ok=True)
    os.makedirs(os.path.join(out, 'web', 'lib'), exist_ok=True)

    for f in ('package.json', 'package-lock.json', 'tsconfig.json', 'README.md'):
        src = os.path.join(REPO, 'mcp', f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out, 'mcp', f))

    shutil.copytree(os.path.join(REPO, 'mcp', 'src'), os.path.join(out, 'mcp', 'src'))

    for f in ('searchQuery.ts', 'nace.ts', 'registryText.ts'):
        shutil.copy2(os.path.join(REPO, 'web', 'lib', f),
                     os.path.join(out, 'web', 'lib', f))

    io.open(os.path.join(out, 'SETUP.md'), 'w', encoding='utf-8', newline='\n').write(SETUP)

    # Belt and braces: never ship a secret, whatever gets added to src/ later.
    leaked = []
    for root, dirs, files in os.walk(out):
        for f in files:
            if f.startswith('.env') or f.endswith('.env'):
                leaked.append(os.path.join(root, f))
    if leaked:
        print('REFUSING: an env file reached the package:')
        for f in leaked:
            print('  ', f)
        sys.exit(1)

    n = sum(len(fs) for _, _, fs in os.walk(out))
    size = sum(os.path.getsize(os.path.join(r, f))
               for r, _, fs in os.walk(out) for f in fs)
    print(f'Packaged to: {out}')
    print(f'  {n} files, {size / 1024:.0f} KB')
    print('  no .env of any kind included (checked)')
    print('\nZip that folder and send it. Send the read-only connection string')
    print('SEPARATELY, over something private — create it with:')
    print('  python scripts/one_time/create_readonly_role.py --apply')


if __name__ == '__main__':
    main()
