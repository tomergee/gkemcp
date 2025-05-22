# MCP server to deploy code to Google Kubernetes Engine (GKE)

Enable MCP-compatible AI agents to deploy apps to GKE.

```json
"mcpServers":{
  "gke": {
    "command": "npx",
    "args": ["-y", "https://github.com/GoogleCloudPlatform/cloud-run-mcp"]
  }
}
```

Deploy from AI-powered IDEs:

<img src="https://github.com/user-attachments/assets/9fdcec30-2b38-4362-9eb1-54cab09e99d4" width="800">

Deploy from AI assistant apps: 

<img src="https://github.com/user-attachments/assets/b10f0335-b332-4640-af38-ea015b46b57c" width="800">

Deploy from agent SDKs, like the [Google Gen AI SDK](https://ai.google.dev/gemini-api/docs/function-calling?example=meeting#use_model_context_protocol_mcp) or [Agent Development Kit](https://google.github.io/adk-docs/tools/mcp-tools/). 

> [!NOTE]  
> This is the repository of an MCP server to deploy code to GKE. The server can be hosted on any platform that supports Node.js.

## Tools

- `deploy-file-contents`: Deploys files to GKE by providing their contents directly.
- `list-clusters`: Lists GKE clusters in a given project and region.
- `get-cluster`: Gets details for a specific GKE cluster.
- `deploy-local-files`*: Deploys files from the local file system to a GKE cluster.
- `deploy-local-folder`*: Deploys a local folder to a GKE cluster.
- `list-projects`*: Lists available GCP projects.
- `create-project`*: Creates a new GCP project and attach it to the first available billing account. A project ID can be optionally specified.

_\* only available when running locally_

## Use as local MCP server

Run the GKE MCP server on your local machine using local Google Cloud credentials. This is best if you are using an AI-assisted IDE (e.g. Cursor) or a desktop AI application (e.g. Claude).

0. Install [Node.js](https://nodejs.org/en/download/) (LTS version recommended).

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Log in to your Google Cloud account using the command:
   ```bash
   gcloud auth login
   ```

3. Set up application credentials using the command:
   ```bash
   gcloud auth application-default login
   ```

4. Install kubectl:
   ```bash
   gcloud components install kubectl
   ```

5. Update the MCP configuration file of your MCP client with the following:

   ```json 
      "gke": {
        "command": "npx",
        "args": ["-y", "https://github.com/GoogleCloudPlatform/cloud-run-mcp"]
      }
   ```

## Use as remote MCP server

> [!WARNING]  
> Do not use the remote MCP server without authentication. In the following instructions, we will use IAM authentication to secure the connection to the MCP server from your local machine. This is important to prevent unauthorized access to your Google Cloud resources.

Run the GKE MCP server itself on a GKE cluster with connection from your local machine authenticated via IAM.
With this option, you will only be able to deploy code to the same Google Cloud project as where the MCP server is running.

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) and authenticate with your Google account.

2. Log in to your Google Cloud account using the command:
   ```bash
   gcloud auth login
   ```

3. Set your Google Cloud project ID using the command:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

4. Create a GKE cluster if you don't have one:
   ```bash
   gcloud container clusters create mcp-server-cluster --zone europe-west1-b --num-nodes 1
   ```

5. Deploy the MCP server to GKE:
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/GoogleCloudPlatform/cloud-run-mcp/main/k8s/mcp-server.yaml
   ```

6. Set up port forwarding to access the MCP server:
   ```bash
   kubectl port-forward service/mcp-server 3000:80
   ```

7. Update the MCP configuration file of your MCP client with the following:

   ```json 
      "gke": {
        "url": "http://localhost:3000/sse"
      }
   ```

   If your MCP client does not support the `url` attribute, you can use [mcp-remote](https://www.npmjs.com/package/mcp-remote):

   ```json 
      "gke": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "http://localhost:3000/sse"]
      }
   ```

## Prerequisites

Before using this MCP server, ensure you have:

1. A Google Cloud Platform account with billing enabled
2. The Google Cloud SDK installed and configured
3. kubectl installed and configured
4. A GKE cluster created in your project
5. The necessary IAM permissions to manage GKE resources

## Required APIs

The following Google Cloud APIs must be enabled in your project:

- `container.googleapis.com` (GKE API)
- `iam.googleapis.com` (IAM API)
- `storage.googleapis.com` (Cloud Storage API)
- `cloudbuild.googleapis.com` (Cloud Build API)
- `artifactregistry.googleapis.com` (Artifact Registry API)

The MCP server will attempt to enable these APIs automatically if they are not already enabled.
