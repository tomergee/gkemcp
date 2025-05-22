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

// Configuration
const REPO_NAME = 'mcp-gke-deployments';
const ZIP_FILE_NAME = 'source.zip';
const IMAGE_TAG = 'latest';
const REQUIRED_APIS = [
  'iam.googleapis.com',
  'storage.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'container.googleapis.com',
];

// Initialize Clients
let storage;
let cloudBuildClient;
let artifactRegistryClient;
let containerClient;

/**
 * Helper function to log a message and call the progress callback.
 * @param {string} message - The message to log.
 * @param {function(object): void} [progressCallback] - Optional callback for progress updates.
 * @param {'debug' | 'info' | 'warn' | 'error'} [severity='info'] - The severity level of the message.
 */
function logAndProgress(message, progressCallback, severity = 'info') {
  switch (severity) {
    case 'error':
      console.error(message);
      break;
    case 'warn':
    case 'info':
    case 'debug':
    default:
      console.log(message);
      break;
  }
  if (progressCallback) {
    progressCallback({ level: severity, data: message });
  }
}

/**
 * Ensures that the specified Google Cloud APIs are enabled for the given project.
 */
async function ensureApisEnabled(projectId, apis, progressCallback) {
  const { ServiceUsageClient } = await import('@google-cloud/service-usage');
  const serviceUsageClient = new ServiceUsageClient({ projectId });
  logAndProgress('Checking and enabling required APIs...', progressCallback);

  for (const api of apis) {
    const serviceName = `projects/${projectId}/services/${api}`;
    try {
      const [service] = await serviceUsageClient.getService({ name: serviceName });
      if (service.state !== 'ENABLED') {
        logAndProgress(`API [${api}] is not enabled. Enabling...`, progressCallback);
        const [operation] = await serviceUsageClient.enableService({ name: serviceName });
        await operation.promise();
      }
    } catch (error) {
      const errorMessage = `Failed to ensure API [${api}] is enabled. Please check manually.`;
      console.error(errorMessage, error);
      logAndProgress(errorMessage, progressCallback, 'error');
      throw new Error(errorMessage);
    }
  }
  logAndProgress('All required APIs are enabled.', progressCallback);
}

/**
 * Checks if a GKE cluster exists.
 */
async function checkGkeClusterExists(projectId, location, clusterId, progressCallback) {
  const parent = containerClient.locationPath(projectId, location);
  try {
    await containerClient.getCluster({ name: `${parent}/clusters/${clusterId}` });
    logAndProgress(`GKE cluster ${clusterId} exists.`, progressCallback);
    return true;
  } catch (error) {
    if (error.code === 5) {
      logAndProgress(`GKE cluster ${clusterId} does not exist.`, progressCallback);
      return false;
    }
    const errorMessage = `Error checking GKE cluster ${clusterId}: ${error.message}`;
    console.error(`Error checking GKE cluster ${clusterId}:`, error);
    logAndProgress(errorMessage, progressCallback, 'error');
    throw error;
  }
}

/**
 * Deploys or updates a deployment in GKE.
 */
async function deployToGke(projectId, location, clusterId, deploymentName, imgUrl, progressCallback) {
  const parent = containerClient.locationPath(projectId, location);
  const clusterPath = `${parent}/clusters/${clusterId}`;

  try {
    const exists = await checkGkeClusterExists(projectId, location, clusterId, progressCallback);
    if (!exists) {
      throw new Error(`GKE cluster ${clusterId} does not exist. Please create it first.`);
    }

    // Create deployment manifest
    const deployment = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        labels: {
          'created-by': 'gke-mcp',
        },
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: deploymentName,
          },
        },
        template: {
          metadata: {
            labels: {
              app: deploymentName,
            },
          },
          spec: {
            containers: [
              {
                name: deploymentName,
                image: imgUrl,
                ports: [
                  {
                    containerPort: 8080,
                  },
                ],
              },
            ],
          },
        },
      },
    };

    // Create service manifest
    const service = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: `${deploymentName}-service`,
        labels: {
          'created-by': 'gke-mcp',
        },
      },
      spec: {
        type: 'LoadBalancer',
        ports: [
          {
            port: 80,
            targetPort: 8080,
          },
        ],
        selector: {
          app: deploymentName,
        },
      },
    };

    // Apply manifests using kubectl
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    // Get cluster credentials
    logAndProgress(`Getting credentials for cluster ${clusterId}...`, progressCallback);
    await execPromise(`gcloud container clusters get-credentials ${clusterId} --zone ${location} --project ${projectId}`);

    // Apply deployment
    logAndProgress(`Deploying ${deploymentName} to GKE...`, progressCallback);
    const deploymentYaml = JSON.stringify(deployment);
    const serviceYaml = JSON.stringify(service);
    
    await execPromise(`echo '${deploymentYaml}' | kubectl apply -f -`);
    await execPromise(`echo '${serviceYaml}' | kubectl apply -f -`);

    // Get service external IP
    const { stdout } = await execPromise(`kubectl get service ${deploymentName}-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`);
    
    logAndProgress(`Deployment successful! Service available at: http://${stdout}`, progressCallback);
    return {
      name: deploymentName,
      url: `http://${stdout}`,
    };
  } catch (error) {
    const errorMessage = `Error deploying to GKE: ${error.message}`;
    console.error(`Error deploying to GKE:`, error);
    logAndProgress(errorMessage, progressCallback, 'error');
    throw error;
  }
}

/**
 * Main deployment function
 */
export async function deploy({ projectId, serviceName = 'app', region = 'europe-west1', clusterId = 'default-cluster', files, progressCallback }) {
  try {
    // Initialize clients
    const { Storage } = await import('@google-cloud/storage');
    const { CloudBuildClient } = await import('@google-cloud/cloudbuild');
    const { ArtifactRegistryClient } = await import('@google-cloud/artifact-registry');
    const { ContainerClient } = await import('@google-cloud/container');

    storage = new Storage({ projectId });
    cloudBuildClient = new CloudBuildClient({ projectId });
    artifactRegistryClient = new ArtifactRegistryClient({ projectId });
    containerClient = new ContainerClient({ projectId });

    // Enable required APIs
    await ensureApisEnabled(projectId, REQUIRED_APIS, progressCallback);

    // Create storage bucket
    const bucketName = `${projectId}-${REPO_NAME}`;
    const bucket = await ensureStorageBucketExists(bucketName, region, progressCallback);

    // Zip and upload files
    const zipBuffer = await zipFiles(files, progressCallback);
    await uploadToStorageBucket(bucket, zipBuffer, ZIP_FILE_NAME, progressCallback);

    // Create Artifact Registry repository
    const repoName = `${serviceName}-repo`;
    const targetRepoName = await ensureArtifactRegistryRepoExists(projectId, region, repoName, 'DOCKER', progressCallback);

    // Build and push container image
    const targetImageUrl = `${targetRepoName}/${serviceName}:${IMAGE_TAG}`;
    const hasDockerfile = files.some(file => file.toLowerCase().endsWith('dockerfile'));
    await triggerCloudBuild(projectId, region, bucketName, ZIP_FILE_NAME, targetRepoName, targetImageUrl, hasDockerfile, progressCallback);

    // Deploy to GKE
    const result = await deployToGke(projectId, region, clusterId, serviceName, targetImageUrl, progressCallback);

    return result;
  } catch (error) {
    const errorMessage = `Deployment failed: ${error.message}`;
    console.error('Deployment failed:', error);
    logAndProgress(errorMessage, progressCallback, 'error');
    throw error;
  }
} 