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

import { ContainerClient } from '@google-cloud/container';

/**
 * Lists GKE clusters in a given project and region.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud region where the clusters are located.
 * @returns {Promise<Array>} A promise that resolves to an array of cluster objects.
 */
export async function listClusters(projectId, location) {
  const client = new ContainerClient({ projectId });
  const parent = client.locationPath(projectId, location);
  
  try {
    const [clusters] = await client.listClusters({ parent });
    return clusters;
  } catch (error) {
    console.error('Error listing GKE clusters:', error);
    throw error;
  }
}

/**
 * Gets details for a specific GKE cluster.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud region where the cluster is located.
 * @param {string} clusterId - The ID of the GKE cluster.
 * @returns {Promise<Object>} A promise that resolves to the cluster object.
 */
export async function getCluster(projectId, location, clusterId) {
  const client = new ContainerClient({ projectId });
  const name = client.clusterPath(projectId, location, clusterId);
  
  try {
    const [cluster] = await client.getCluster({ name });
    return cluster;
  } catch (error) {
    if (error.code === 5) { // NOT_FOUND
      return null;
    }
    console.error('Error getting GKE cluster:', error);
    throw error;
  }
}

/**
 * Creates a new GKE cluster.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud region where the cluster should be created.
 * @param {string} clusterId - The ID for the new GKE cluster.
 * @param {Object} options - Additional options for cluster creation.
 * @returns {Promise<Object>} A promise that resolves to the created cluster object.
 */
export async function createCluster(projectId, location, clusterId, options = {}) {
  const client = new ContainerClient({ projectId });
  const parent = client.locationPath(projectId, location);
  
  const cluster = {
    name: clusterId,
    initialNodeCount: options.nodeCount || 1,
    nodeConfig: {
      machineType: options.machineType || 'e2-medium',
      diskSizeGb: options.diskSizeGb || 100,
    },
    masterAuth: {
      clientCertificateConfig: {
        issueClientCertificate: true,
      },
    },
    network: options.network || 'default',
    subnetwork: options.subnetwork || 'default',
    ipAllocationPolicy: {
      useIpAliases: true,
    },
    defaultMaxPodsConstraint: {
      maxPodsPerNode: options.maxPodsPerNode || 110,
    },
    releaseChannel: {
      channel: options.releaseChannel || 'REGULAR',
    },
  };

  try {
    const [operation] = await client.createCluster({
      parent,
      cluster,
    });
    const [createdCluster] = await operation.promise();
    return createdCluster;
  } catch (error) {
    console.error('Error creating GKE cluster:', error);
    throw error;
  }
}

/**
 * Deletes a GKE cluster.
 * @param {string} projectId - The Google Cloud project ID.
 * @param {string} location - The Google Cloud region where the cluster is located.
 * @param {string} clusterId - The ID of the GKE cluster to delete.
 * @returns {Promise<void>} A promise that resolves when the cluster is deleted.
 */
export async function deleteCluster(projectId, location, clusterId) {
  const client = new ContainerClient({ projectId });
  const name = client.clusterPath(projectId, location, clusterId);
  
  try {
    const [operation] = await client.deleteCluster({ name });
    await operation.promise();
  } catch (error) {
    console.error('Error deleting GKE cluster:', error);
    throw error;
  }
} 