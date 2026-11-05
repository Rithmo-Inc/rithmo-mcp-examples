# Connect your own agent

1. In Rithmo, choose **Connect an agent**, enter the agent's name and choose **Create connection**.
   Copy the **Server URL** and **Access token**. The token starts with `rmcp_` and is shown once; keep it
   in a secret store, never in code.
2. Connect to the server URL over Streamable HTTP with the header `Authorization: Bearer <token>`.

## Check the connection

```bash
npm install
cp .env.example .env   # then set both values
npm run connect
```

`connect.mjs` connects to Rithmo and lists the tools it offers your agent.
