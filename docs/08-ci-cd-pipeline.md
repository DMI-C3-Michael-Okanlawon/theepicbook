# Task 8 — CI/CD Pipeline

## Implementation

Azure Pipelines builds and publishes the EpicBook frontend and backend
Docker images, then deploys them to the Azure VM through SSH.

Pipeline definition:
[azure-pipelines-capstone.yml](../azure-pipelines-capstone.yml)

Deployment script:
[scripts/deploy-capstone.sh](../scripts/deploy-capstone.sh)

## Pipeline environment

| Item | Configuration |
| --- | --- |
| Azure DevOps project | Week10-SelfHosted-Agent |
| Agent pool | SelfHostedPool |
| Self-hosted agent | week10-ado-agent |
| Agent Docker Engine | 29.9.1 |
| Agent Docker Compose | v5.6.0 |
| Deployment VM | week11-docker-vm |
| Deployment address | 20.115.4.158 |
| Docker registry connection | dockerhub-epicbook-capstone |
| SSH connection | ssh-epicbook-capstone |

## Trigger and image tags

The pipeline runs for changes on assignment06-docker-capstone affecting:

- frontend/**
- backend/**
- scripts/deploy-capstone.sh
- azure-pipelines-capstone.yml

Pull-request triggers are disabled. CI changes are batched.

Both application images receive the same Azure Pipelines Build.BuildId
tag, allowing a deployment to be traced to its pipeline run.

Images:

- michaelokanlawon/epicbook-frontend:<Build.BuildId>
- michaelokanlawon/epicbook-backend:<Build.BuildId>

The deployment uses the build-specific tags rather than latest.

## Stage 1 — Build and publish images

The pipeline:

1. Checks out the source.
2. Checks Docker availability and deployment-script syntax.
3. Verifies SSH access and validates the VM's Compose configuration.
4. Builds the frontend using frontend/Dockerfile.
5. Builds the backend using backend/Dockerfile.
6. Pushes both tagged images to Docker Hub.
7. Logs out of Docker Hub.

Both Dockerfiles use multiple stages to separate dependency installation
from the runtime image.

## Stage 2 — Deploy and verify HTTPS

After the build stage succeeds, the pipeline transfers the deployment
script through SSH and executes it with the build ID.

The script:

1. Acquires a deployment lock.
2. Saves a restricted-permission backup of the current .env file.
3. Updates FRONTEND_IMAGE and BACKEND_IMAGE while retaining other settings.
4. Validates Compose and pulls the tagged application images.
5. Updates the backend and frontend, waiting for their healthchecks.
6. Recreates Nginx to refresh its upstream container addresses.
7. Verifies the homepage and /api/books?limit=1 over HTTPS.
8. Prints container status and the deployed build ID.

HTTPS verification uses the application hostname with certificate
validation and resolves it to loopback on the deployment VM.

The script does not run database initialization or remove database volumes.
The existing restored MySQL volume remains configured through .env.

## Recovery behavior

If deployment or verification fails, the script restores the previous
.env file and attempts to recreate the application services using the
previous image settings.

A failed deployment remains a failed pipeline run even if recovery
succeeds. Recovery requires the previous images to remain available.

Rollback is implemented but has not yet been demonstrated through an
injected pipeline failure.

## Credentials and access

The Docker Hub token is stored in the Docker Registry service connection.
The dedicated SSH private key is stored in the SSH service connection.
Neither credential is committed to the repository.

SSH deployment originates from the self-hosted agent. Its public IP,
51.8.104.41/32, must be allowed in both VM-associated NSGs alongside the
administrator's current /32 address.

The pipeline uses azureuser with passwordless sudo for Docker operations.
This is a privileged deployment credential; service-connection access
should remain restricted to the intended pipeline.

## Verified run

On 15 October 2026, both stages completed successfully:

- Build and publish images
- Deploy and verify HTTPS

The deployment job ran on week10-ado-agent. The successful deployment
step includes the homepage and backend API HTTPS checks.

[Successful Azure Pipelines run](https://dev.azure.com/Michael-Okanlawon-DMI-Cohort-3/Week10-SelfHosted-Agent/_build/results?buildId=16)

Application:
https://epicbook-michael-c3-2026.eastus.cloudapp.azure.com/

Docker Hub repositories:

- https://hub.docker.com/r/michaelokanlawon/epicbook-frontend
- https://hub.docker.com/r/michaelokanlawon/epicbook-backend

## Scope

This pipeline deploys application images to the existing VM configuration.
Changes to Compose, Nginx, certificates, or host configuration require
a separate deployment procedure.

The deployment updates single service instances, so brief interruption
is possible. It is not a zero-downtime deployment.

The self-hosted agent VM must be running for queued jobs to execute.

## Screenshot evidence

Submitted separately:

Task 8 — CI/CD Pipeline — Completed automated pipeline run
