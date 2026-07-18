def services = [
  'api-gateway'            : 'gateway',
  'patient-records-service': 'services/patient-records',
  'physicians-service'     : 'services/physicians',
  'appointments-service'   : 'services/appointments',
  'waittime-service'       : 'services/waittime',
  'admission-service'      : 'services/admission',
  'billing-service'        : 'services/billing',
  'fake-payment-gateway'   : 'services/fake-payment-gateway',
  'payments-service'       : 'services/payments',
  'notifications-service'  : 'services/notifications',
  'administration-service' : 'services/administration'
]

pipeline {
  agent any

  options {
    buildDiscarder(logRotator(numToKeepStr: '30'))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 90, unit: 'MINUTES')
  }

  parameters {
    choice(name: 'DEPLOY_ENVIRONMENT', choices: ['dev', 'test', 'staging', 'prod'], description: 'Environment included in the image tags.')
    choice(name: 'REGISTRY_PROVIDER', choices: ['dockerhub', 'ecr'], description: 'Registry that receives the scanned images.')
    string(name: 'IMAGE_PREFIX', defaultValue: 'hospital-management', description: 'Prefix used for every image repository.')
    string(name: 'DOCKERHUB_NAMESPACE', defaultValue: 'liontechacademy', description: 'Docker Hub user or organization.')
    string(name: 'DOCKERHUB_CREDENTIALS_ID', defaultValue: 'dockerhub-credentials', description: 'Jenkins Username/Password credential ID for Docker Hub.')
    string(name: 'AWS_REGION', defaultValue: 'us-east-1', description: 'AWS region containing the ECR repositories.')
    string(name: 'AWS_ACCOUNT_ID', defaultValue: '', description: 'Optional expected 12-digit AWS account ID. Leave blank to discover it with STS.')
    string(name: 'AWS_CREDENTIALS_ID', defaultValue: 'aws-credentials', description: 'Jenkins AWS credential ID for ECR.')
    string(name: 'ECR_REPOSITORY_PREFIX', defaultValue: 'hospital-management', description: 'ECR repository path prefix.')
    booleanParam(name: 'CREATE_ECR_REPOSITORIES', defaultValue: true, description: 'Create missing ECR repositories before pushing.')
    choice(name: 'TRIVY_SEVERITY', choices: ['CRITICAL', 'HIGH,CRITICAL', 'MEDIUM,HIGH,CRITICAL'], description: 'Vulnerability severities that fail the build.')
    booleanParam(name: 'IGNORE_UNFIXED', defaultValue: true, description: 'Ignore vulnerabilities with no available fix.')
    booleanParam(name: 'PUSH_ENVIRONMENT_LATEST', defaultValue: true, description: 'Also publish a mutable <environment>-latest tag after the immutable tag passes scanning.')
  }

  environment {
    DOCKER_BUILDKIT = '1'
    BUILDKIT_PROGRESS = 'plain'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.GIT_SHORT_SHA = sh(script: 'git rev-parse --short=8 HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "${params.DEPLOY_ENVIRONMENT}-${env.BUILD_NUMBER}-${env.GIT_SHORT_SHA}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${params.DEPLOY_ENVIRONMENT} ${env.GIT_SHORT_SHA}"
        }
      }
    }

    stage('Validate') {
      steps {
        script {
          if (!(params.IMAGE_PREFIX ==~ /[a-z0-9]+([._-][a-z0-9]+)*/)) {
            error('IMAGE_PREFIX must be a lowercase Docker repository prefix.')
          }
          if (!(params.DOCKERHUB_NAMESPACE ==~ /[a-z0-9]+([._-][a-z0-9]+)*/)) {
            error('DOCKERHUB_NAMESPACE must be a lowercase Docker Hub namespace.')
          }
          if (!(params.ECR_REPOSITORY_PREFIX ==~ /[a-z0-9]+([._\/-][a-z0-9]+)*/)) {
            error('ECR_REPOSITORY_PREFIX contains unsupported characters.')
          }
          if (!(params.AWS_REGION ==~ /[a-z]{2}(-gov)?-[a-z]+-\d/)) {
            error('AWS_REGION is not a valid AWS region name.')
          }
          if (params.AWS_ACCOUNT_ID && !(params.AWS_ACCOUNT_ID ==~ /\d{12}/)) {
            error('AWS_ACCOUNT_ID must be blank or a 12-digit account ID.')
          }
        }
        sh '''
          set -eu
          command -v docker
          command -v trivy
          docker version
          trivy --version
          test -f Dockerfile
          test -f docker-compose.yml
        '''
      }
    }

    stage('Resolve Registry') {
      steps {
        script {
          if (params.REGISTRY_PROVIDER == 'dockerhub') {
            env.REGISTRY_HOST = 'docker.io'
            env.REGISTRY_BASE = params.DOCKERHUB_NAMESPACE
          } else {
            withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: params.AWS_CREDENTIALS_ID]]) {
              def actualAccountId = sh(
                script: "aws sts get-caller-identity --query Account --output text --region ${params.AWS_REGION}",
                returnStdout: true
              ).trim()
              if (params.AWS_ACCOUNT_ID && params.AWS_ACCOUNT_ID != actualAccountId) {
                error("Configured AWS_ACCOUNT_ID does not match the authenticated AWS account (${actualAccountId}).")
              }
              env.RESOLVED_AWS_ACCOUNT_ID = actualAccountId
              env.REGISTRY_HOST = "${actualAccountId}.dkr.ecr.${params.AWS_REGION}.amazonaws.com"
              env.REGISTRY_BASE = "${env.REGISTRY_HOST}/${params.ECR_REPOSITORY_PREFIX}"
            }
          }
          echo "Publishing ${services.size()} images to ${env.REGISTRY_HOST} with tag ${env.IMAGE_TAG}"
        }
      }
    }

    stage('Prepare ECR') {
      when {
        expression { params.REGISTRY_PROVIDER == 'ecr' && params.CREATE_ECR_REPOSITORIES }
      }
      steps {
        withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: params.AWS_CREDENTIALS_ID]]) {
          script {
            services.keySet().each { serviceName ->
              def repository = "${params.ECR_REPOSITORY_PREFIX}/${params.IMAGE_PREFIX}-${serviceName}"
              sh """
                aws ecr describe-repositories --repository-names '${repository}' --region '${params.AWS_REGION}' >/dev/null 2>&1 || \\
                aws ecr create-repository --repository-name '${repository}' --image-scanning-configuration scanOnPush=true --image-tag-mutability MUTABLE --region '${params.AWS_REGION}' >/dev/null
              """
            }
          }
        }
      }
    }

    stage('Build Images') {
      steps {
        script {
          def buildTasks = [:]
          services.each { serviceName, appDir ->
            buildTasks[serviceName] = {
              def image = "${env.REGISTRY_BASE}/${params.IMAGE_PREFIX}-${serviceName}"
              sh """
                docker build --pull \\
                  --build-arg APP_DIR='${appDir}' \\
                  --label org.opencontainers.image.revision='${env.GIT_COMMIT}' \\
                  --label org.opencontainers.image.source='${env.GIT_URL}' \\
                  --label org.opencontainers.image.version='${env.IMAGE_TAG}' \\
                  --label com.liontech.environment='${params.DEPLOY_ENVIRONMENT}' \\
                  --tag '${image}:${env.IMAGE_TAG}' \\
                  .
              """
            }
          }
          parallel buildTasks
        }
      }
    }

    stage('Update Trivy Database') {
      steps {
        sh 'trivy image --no-progress --download-db-only'
      }
    }

    stage('Scan Images') {
      steps {
        script {
          def scanTasks = [:]
          services.keySet().each { serviceName ->
            scanTasks[serviceName] = {
              def image = "${env.REGISTRY_BASE}/${params.IMAGE_PREFIX}-${serviceName}:${env.IMAGE_TAG}"
              def ignoreUnfixed = params.IGNORE_UNFIXED ? '--ignore-unfixed' : ''
              sh """
                mkdir -p trivy-reports
                trivy image --quiet --no-progress --skip-db-update --scanners vuln --exit-code 1 ${ignoreUnfixed} \\
                  --severity '${params.TRIVY_SEVERITY}' \\
                  --format json --output 'trivy-reports/${serviceName}.json' \\
                  '${image}'
              """
            }
          }
          parallel scanTasks
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-reports/*.json', allowEmptyArchive: true, fingerprint: true
        }
      }
    }

    stage('Login and Push') {
      steps {
        script {
          def pushAll = {
            services.keySet().each { serviceName ->
              def image = "${env.REGISTRY_BASE}/${params.IMAGE_PREFIX}-${serviceName}"
              sh "docker push '${image}:${env.IMAGE_TAG}'"
              if (params.PUSH_ENVIRONMENT_LATEST) {
                sh """
                  docker tag '${image}:${env.IMAGE_TAG}' '${image}:${params.DEPLOY_ENVIRONMENT}-latest'
                  docker push '${image}:${params.DEPLOY_ENVIRONMENT}-latest'
                """
              }
            }
          }

          if (params.REGISTRY_PROVIDER == 'dockerhub') {
            withCredentials([usernamePassword(
              credentialsId: params.DOCKERHUB_CREDENTIALS_ID,
              usernameVariable: 'REGISTRY_USERNAME',
              passwordVariable: 'REGISTRY_PASSWORD'
            )]) {
              sh 'printf %s "$REGISTRY_PASSWORD" | docker login --username "$REGISTRY_USERNAME" --password-stdin docker.io'
              pushAll()
            }
          } else {
            withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: params.AWS_CREDENTIALS_ID]]) {
              sh "aws ecr get-login-password --region '${params.AWS_REGION}' | docker login --username AWS --password-stdin '${env.REGISTRY_HOST}'"
              pushAll()
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo "Published all images with immutable tag ${env.IMAGE_TAG} to ${env.REGISTRY_HOST}."
    }
    always {
      sh 'docker logout "${REGISTRY_HOST:-docker.io}" >/dev/null 2>&1 || true'
      sh '''
        if [ -n "${IMAGE_TAG:-}" ]; then
          docker image ls --format '{{.Repository}}:{{.Tag}}' | grep ":${IMAGE_TAG}$" | xargs -r docker image rm -f || true
        fi
      '''
      deleteDir()
    }
  }
}
