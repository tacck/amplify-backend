import { SSMSecretClient } from './ssm_secret.js';
import { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { SSM } from '@aws-sdk/client-ssm';
import { AppId, BackendIdentifier } from '@aws-amplify/plugin-types';
import { SSMSecretClientWithAmplifyErrorHandling } from './ssm_secret_with_amplify_error_handling.js';

/**
 * The unique identifier of the secret.
 */
export type SecretIdentifier = {
  name: string;
  version?: number;
};

/**
 * The secret object.
 */
export type Secret = SecretIdentifier & {
  value: string;
  lastUpdated?: Date;
};

/**
 * The returned object type of listSecrets API.
 */
export type SecretListItem = SecretIdentifier & {
  lastUpdated?: Date;
};

/**
 * The client to manage backend secret.
 */
export type SecretClient = {
  /**
   * Get a secret value.
   */
  getSecret: (
    backendIdentifier: BackendIdentifier | AppId,
    secretIdentifier: SecretIdentifier,
  ) => Promise<Secret>;

  /**
   * List secrets.
   */
  listSecrets: (
    backendIdentifier: BackendIdentifier | AppId,
  ) => Promise<SecretListItem[]>;

  /**
   * Set a secret.
   */
  setSecret: (
    backendIdentifier: BackendIdentifier | AppId,
    secretName: string,
    secretValue: string,
  ) => Promise<SecretIdentifier>;

  /**
   * Remove a secret.
   */
  removeSecret: (
    backendIdentifier: BackendIdentifier | AppId,
    secretName: string,
  ) => Promise<void>;

  /**
   * Remove secrets.
   */
  removeSecrets: (
    backendIdentifier: BackendIdentifier | AppId,
    secretNames: string[],
  ) => Promise<void>;
};

/**
 * Secret client options.
 */
export type SecretClientOptions = {
  credentials?: AwsCredentialIdentityProvider;
  region?: string;
};

/**
 * Creates an Amplify secret client. Used in the backend lambda for fetching secrets
 */
export const getSecretClient = (
  secretClientOptions?: SecretClientOptions,
): SecretClient => {
  return new SSMSecretClient(
    new SSM({
      credentials: secretClientOptions?.credentials,
      region: secretClientOptions?.region,
    }),
  );
};

/**
 * Creates an Amplify secret client with inbuilt amplify error handling
 * Used in the amplify CLI commands such as sandbox and pipeline-deploy
 */
export const getSecretClientWithAmplifyErrorHandling = (
  secretClientOptions?: SecretClientOptions,
): SecretClient => {
  return new SSMSecretClientWithAmplifyErrorHandling(
    getSecretClient(secretClientOptions),
  );
};
