/*
Copyright 2025 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { z } from "zod";
import { deploy } from './lib/gke-deploy.js';
import { listClusters, getCluster } from './lib/gke-clusters.js';
import { listProjects, createProjectAndAttachBilling } from './lib/gcp-projects.js';
import { checkGCP } from './lib/gcp-metadata.js';

export const registerTools = (server) => {
  // Tool to list GCP projects
  server.tool(
    "list_projects",
    "Lists available GCP projects",
    async () => {
      try {
        const projects = await listProjects();
        return {
          content: [{
            type: 'text',
            text: `Available GCP Projects:\n${projects.map(p => `- ${p.id}`).join('\n')}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing GCP projects: ${error.message}`
          }]
        };
      }
    }
  );

  // Tool to create a new GCP project
  server.tool(
    "create_project",
    "Creates a new GCP project and attempts to attach it to the first available billing account. A project ID can be optionally specified; otherwise it will be automatically generated.",
    {
      projectId: z.string().optional().describe("Optional. The desired ID for the new GCP project. If not provided, an ID will be auto-generated."),
    },
    async ({ projectId }) => {
      if (projectId !== undefined && (typeof projectId !== 'string' || projectId.trim() === '')) {
        return {
          content: [{
            type: 'text',
            text: "Error: If provided, Project ID must be a non-empty string."
          }]
        };
      }
      try {
        const result = await createProjectAndAttachBilling(projectId);
        return {
          content: [{
            type: 'text',
            text: `Successfully created GCP project with ID "${newProjectId}". You can now use this project ID for deployments.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating GCP project or attaching billing: ${error.message}`
          }]
        };
      }
    }
  );

  // Listing GKE clusters
  server.tool(
    "list_clusters",
    "Lists GKE clusters in a given project and region.",
    {
      project: z.string().describe("Google Cloud project ID"),
      region: z.string().describe("Region where the clusters are located").default('europe-west1'),
    },
    async ({ project, region }) => {
      if (typeof project !== 'string') {
        return { content: [{ type: 'text', text: "Error: Project ID must be provided and be a non-empty string." }] };
      }

      try {
        const clusters = await listClusters(project, region);
        const clusterList = clusters.map(c => {
          const clusterName = c.name.split('/').pop();
          return `- ${clusterName} (Status: ${c.status})`;
        }).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Clusters in project ${project} (location ${region}):\n${clusterList}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing clusters for project ${project} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Dynamic resource for getting a specific cluster
  server.tool(
    "get_cluster",
    "Gets details for a specific GKE cluster.",
    {
      project: z.string().describe("Google Cloud project ID containing the cluster"),
      region: z.string().describe("Region where the cluster is located").default('europe-west1'),
      cluster: z.string().describe("Name of the GKE cluster"),
    },
    async ({ project, region, cluster }) => {
      if (typeof project !== 'string') {
        return { content: [{ type: 'text', text: "Error: Project ID must be provided." }] };
      }
      if (typeof cluster !== 'string') {
        return { content: [{ type: 'text', text: "Error: Cluster name must be provided." }] };
      }
      try {
        const clusterDetails = await getCluster(project, region, cluster);
        if (clusterDetails) {
          return {
            content: [{
              type: 'text',
              text: `Name: ${cluster}\nRegion: ${region}\nProject: ${project}\nStatus: ${clusterDetails.status}\nNode Count: ${clusterDetails.currentNodeCount}\nVersion: ${clusterDetails.currentMasterVersion}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Cluster ${cluster} not found in project ${project} (region ${region}).`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting cluster ${cluster} in project ${project} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  server.tool(
    'deploy_local_files',
    'Deploy local files to GKE. Takes an array of absolute file paths from the local filesystem that will be deployed. Use this tool if the files exists on the user local filesystem.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().optional().default('europe-west1').describe('Region to deploy the service to'),
      cluster: z.string().optional().default('default-cluster').describe('Name of the GKE cluster to deploy to'),
      service: z.string().optional().default('app').describe('Name of the service to deploy'),
      files: z.array(z.string()).describe('Array of absolute file paths to deploy (e.g. ["/home/user/project/src/index.js", "/home/user/project/package.json"])'),
    },
    async ({ project, region, cluster, service, files }) => {
      if (typeof project !== 'string') {
        throw new Error('Project must specified, please prompt the user for a valid existing Google Cloud project ID.');
      }
      if (typeof files !== 'object' || !Array.isArray(files)) {
        throw new Error('Files must specified');
      }
      if (files.length === 0) {
        throw new Error('No files specified for deployment');
      }

      // Deploy to GKE
      try {
        const response = await deploy({
          projectId: project,
          serviceName: service,
          region: region,
          clusterId: cluster,
          files: files,
        });
        return {
          content: [
            {
              type: 'text',
              text: `GKE service ${service} deployed in project ${project}\nCloud Console: https://console.cloud.google.com/kubernetes/workload/overview?project=${project}\nService URL: ${response.url}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying to GKE: ${error.message || error}`,
            }
          ],
        };
      }
    });

  server.tool(
    'deploy_local_folder',
    'Deploy a local folder to GKE. Takes an absolute folder path from the local filesystem that will be deployed. Use this tool if the entire folder content needs to be deployed.',
    {
      project: z.string().describe('Google Cloud project ID. Do not select it yourself, make sure the user provides or confirms the project ID.'),
      region: z.string().optional().default('europe-west1').describe('Region to deploy the service to'),
      cluster: z.string().optional().default('default-cluster').describe('Name of the GKE cluster to deploy to'),
      service: z.string().optional().default('app').describe('Name of the service to deploy'),
      folderPath: z.string().describe('Absolute path to the folder to deploy (e.g. "/home/user/project/src")'),
    },
    async ({ project, region, cluster, service, folderPath }) => {
      if (typeof project !== 'string') {
        throw new Error('Project must be specified, please prompt the user for a valid existing Google Cloud project ID.');
      }
      if (typeof folderPath !== 'string' || folderPath.trim() === '') {
        throw new Error('Folder path must be specified and be a non-empty string.');
      }

      // Deploy to GKE
      try {
        const response = await deploy({
          projectId: project,
          serviceName: service,
          region: region,
          clusterId: cluster,
          files: [folderPath], // Pass the folder path as a single item in an array
        });
        return {
          content: [
            {
              type: 'text',
              text: `GKE service ${service} deployed from folder ${folderPath} in project ${project}\nCloud Console: https://console.cloud.google.com/kubernetes/workload/overview?project=${project}\nService URL: ${response.url}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying to GKE: ${error.message || error}`,
            }
          ],
        };
      }
    });
};

export const registerToolsRemote = async (server) => {
  const gcpInfo = await checkGCP();
  if (!gcpInfo || !gcpInfo.project) {
    throw new Error("Cannot register remote tools: GCP project ID could not be determined from the metadata server.");
  }
  const currentProject = gcpInfo.project;
  const currentRegion = gcpInfo.region || 'europe-west1'; // Fallback if region is not available

  // Listing GKE clusters (Remote)
  server.tool(
    "list_clusters",
    `Lists GKE clusters in GCP project ${currentProject} and a given region.`,
    {
      region: z.string().describe("Region where the clusters are located").default(currentRegion),
    },
    async ({ region }) => {
      try {
        const clusters = await listClusters(currentProject, region);
        const clusterList = clusters.map(c => {
          const clusterName = c.name.split('/').pop();
          return `- ${clusterName} (Status: ${c.status})`;
        }).join('\n');
        return {
          content: [{
            type: 'text',
            text: `Clusters in project ${currentProject} (location ${region}):\n${clusterList}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing clusters for project ${currentProject} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Dynamic resource for getting a specific cluster (Remote)
  server.tool(
    "get_cluster",
    `Gets details for a specific GKE cluster in GCP project ${currentProject}.`,
    {
      region: z.string().describe("Region where the cluster is located").default(currentRegion),
      cluster: z.string().describe("Name of the GKE cluster"),
    },
    async ({ region, cluster }) => {
      if (typeof cluster !== 'string') {
        return { content: [{ type: 'text', text: "Error: Cluster name must be provided." }] };
      }
      try {
        const clusterDetails = await getCluster(currentProject, region, cluster);
        if (clusterDetails) {
          return {
            content: [{
              type: 'text',
              text: `Name: ${cluster}\nRegion: ${region}\nProject: ${currentProject}\nStatus: ${clusterDetails.status}\nNode Count: ${clusterDetails.currentNodeCount}\nVersion: ${clusterDetails.currentMasterVersion}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Cluster ${cluster} not found in project ${currentProject} (region ${region}).`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting cluster ${cluster} in project ${currentProject} (region ${region}): ${error.message}`
          }]
        };
      }
    }
  );

  // Deploy file contents to GKE (Remote)
  server.tool(
    'deploy_file_contents',
    `Deploy files to GKE by providing their contents directly to the GCP project ${currentProject}.`,
    {
      region: z.string().optional().default(currentRegion).describe('Region to deploy the service to'),
      cluster: z.string().optional().default('default-cluster').describe('Name of the GKE cluster to deploy to'),
      service: z.string().optional().default('app').describe('Name of the GKE service to deploy to'),
      files: z.array(z.object({
        filename: z.string().describe('Name and path of the file (e.g. "src/index.js" or "data/config.json")'),
        content: z.string().describe('Text content of the file'),
      })).describe('Array of file objects containing filename and content'),
    },
    async ({ region, cluster, service, files }) => {
      console.log(`New deploy request (remote): ${JSON.stringify({ project: currentProject, region, cluster, service, files })}`);

      if (typeof files !== 'object' || !Array.isArray(files) || files.length === 0) {
        throw new Error('Files must be specified');
      }

      // Validate that each file has content
      for (const file of files) {
        if (!file.content) {
          throw new Error(`File ${file.filename} must have content`);
        }
      }

      // Deploy to GKE
      try {
        const response = await deploy({
          projectId: currentProject,
          serviceName: service,
          region: region,
          clusterId: cluster,
          files: files,
        });
        return {
          content: [
            {
              type: 'text',
              text: `GKE service ${service} deployed in project ${currentProject}\nCloud Console: https://console.cloud.google.com/kubernetes/workload/overview?project=${currentProject}\nService URL: ${response.url}`,
            }
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error deploying to GKE: ${error.message || error}`,
            }
          ],
        };
      }
  });
};