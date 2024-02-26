import * as pulumi from "@pulumi/pulumi";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";

const config = new pulumi.Config();

const clusterName = config.get("clusterName");


// Existing Pulumi stack reference in the format:
const vpcStackRef = new pulumi.StackReference(config.get("vpcStackRef") ?? "");

const vpcId = vpcStackRef.getOutput("VpcId");
const privateSubnetIds = vpcStackRef.getOutput("PrivateSubnetIds");
const publicSubnetIds = vpcStackRef.getOutput("PublicSubnetIds");

const cluster = new eks.Cluster(`${clusterName}`, {
  vpcId: vpcId,
  privateSubnetIds: privateSubnetIds,
  publicSubnetIds: publicSubnetIds, 
  fargate: true,
  createOidcProvider: true,
  tags: {},
});

const provider = new k8s.Provider("k8s", {
  kubeconfig: cluster.kubeconfig,
  enableServerSideApply: true,
});

const name = "nginx-example";

// Create a NGINX Deployment
const appLabels = { appClass: name };
const deployment = new k8s.apps.v1.Deployment(name,
    {
        metadata: {
            namespace: 'default',
            labels: appLabels,
        },
        spec: {
            replicas: 1,
            selector: { matchLabels: appLabels },
            template: {
                metadata: {
                    labels: appLabels,
                },
                spec: {
                    containers: [
                        {
                            name: name,
                            image: "nginx:latest",
                            ports: [{ name: "http", containerPort: 80 }],
                        },
                    ],
                },
            },
        },
    },
    {
        provider,
    },
);

// Export the Deployment name
export const deploymentName = deployment.metadata.name;

// Create a LoadBalancer Service for the NGINX Deployment
const service = new k8s.core.v1.Service(name,
    {
        metadata: {
            labels: appLabels,
            namespace: 'default',
        },
        spec: {
            type: "LoadBalancer",
            ports: [{ port: 80, targetPort: "http" }],
            selector: appLabels,
        },
    },
    {
        provider,
    },
);

// Export the Service name and public LoadBalancer Endpoint
export const serviceName = service.metadata.name;
export const serviceHostname = service.status.loadBalancer.ingress[0].hostname;
export const kubeconfig = cluster.kubeconfig;