# Connect your agent to Rithmo

Rithmo governs the AI agents your company runs. Each agent connects to Rithmo's MCP server. Once it is
connected, Rithmo gives the agent its steps for every run over that connection, so you don't write them
into the agent yourself.

Build the agent in its own assistant first, then connect it.

| Your agent runs in | Guide |
| --- | --- |
| ChatGPT | [chatgpt.md](./chatgpt.md) |
| Claude (claude.ai or Claude Code) | [claude.md](./claude.md) |
| Your own code | [custom/](./custom/) |

## Your Rithmo address

Rithmo is deployed in your own cloud environment. Its MCP endpoint is your Rithmo address followed by
`/api/mcp`, for example `https://rithmo.example.com/api/mcp`. Where Rithmo operates an instance for you,
use the address we give you.

## After you connect

- The agent appears on the **Agents** tab in Rithmo.
- It does no real work until someone in your company takes it live there.
- One agent running in two assistants counts as two agents.
