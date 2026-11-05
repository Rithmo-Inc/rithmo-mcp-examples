# Connect a Claude agent

## claude.ai

**Before you start:** on Team and Enterprise plans, an owner adds the connector once for the workspace.

1. In Rithmo, open **Connections** and choose **Connect** on the Claude card. This opens Claude with the
   Rithmo connector filled in. You can also add it by hand: **Customize → Connectors → Add custom connector**,
   name `Rithmo`, URL `https://<your-rithmo-address>/api/mcp`.
2. Sign in with your Rithmo account and approve the connection.

## Claude Code

```bash
claude mcp add --transport http rithmo https://<your-rithmo-address>/api/mcp
```

Then run `/mcp` in Claude Code and sign in to Rithmo.
