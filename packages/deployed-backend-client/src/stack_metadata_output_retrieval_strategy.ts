import {
  CloudFormationClient,
  CloudFormationServiceException,
  DescribeStacksCommand,
  GetTemplateSummaryCommand,
} from '@aws-sdk/client-cloudformation';
import {
  BackendOutput,
  BackendOutputRetrievalStrategy,
  MainStackNameResolver,
} from '@aws-amplify/plugin-types';
import {
  BackendOutputEntryStackMetadata,
  backendOutputStackMetadataSchema,
} from '@aws-amplify/backend-output-schemas';
import {
  BackendOutputClientError,
  BackendOutputClientErrorType,
} from './index.js';

/**
 * Gets Amplify backend outputs from stack metadata and outputs
 */
export class StackMetadataBackendOutputRetrievalStrategy
  implements BackendOutputRetrievalStrategy
{
  /**
   * Instantiate with a CloudFormationClient and a StackNameResolver
   */
  constructor(
    private readonly cfnClient: CloudFormationClient,
    private readonly stackNameResolver: MainStackNameResolver,
  ) {}

  /**
   * Resolves the stackName, then queries CFN for the stack metadata and outputs
   *
   * It combines the metadata and outputs to reconstruct the data object that was provided by the Amplify constructs when writing the output.
   * Except now the data contains the resolved values of the deployed resources rather than CFN references
   */
  fetchBackendOutput = async (): Promise<BackendOutput> => {
    const stackName = await this.stackNameResolver.resolveMainStackName();

    let metadataObject;

    try {
      // GetTemplateSummary includes the template metadata as a string
      const templateSummary = await this.cfnClient.send(
        new GetTemplateSummaryCommand({ StackName: stackName }),
      );

      if (typeof templateSummary.Metadata !== 'string') {
        throw new BackendOutputClientError(
          BackendOutputClientErrorType.METADATA_RETRIEVAL_ERROR,
          'Stack template metadata is not a string',
        );
      }

      metadataObject = JSON.parse(templateSummary.Metadata);
    } catch (error) {
      if (
        error instanceof CloudFormationServiceException &&
        error.message.startsWith('Stack with id') &&
        error.message.endsWith('does not exist')
      ) {
        throw new BackendOutputClientError(
          BackendOutputClientErrorType.NO_STACK_FOUND,
          `Stack with id ${stackName} does not exist`,
        );
      }
      if (
        error instanceof CloudFormationServiceException &&
        ['ExpiredToken', 'InvalidClientTokenId'].includes(error.name)
      ) {
        throw new BackendOutputClientError(
          BackendOutputClientErrorType.CREDENTIALS_ERROR,
          error.message,
        );
      }
      if (
        error instanceof CloudFormationServiceException &&
        error.name === 'AccessDenied'
      ) {
        throw new BackendOutputClientError(
          BackendOutputClientErrorType.ACCESS_DENIED,
          error.message,
        );
      }

      throw error;
    }

    const filteredMetadataObject =
      this.filterBackendOutputEntryStackMetadata(metadataObject);

    // parse and validate the metadata object
    const backendOutputMetadata = backendOutputStackMetadataSchema.parse(
      filteredMetadataObject,
    );

    // DescribeStacks includes the template output
    const stackDescription = await this.cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    );

    const outputs = stackDescription?.Stacks?.[0]?.Outputs;
    if (stackDescription.Stacks?.[0].StackStatus?.endsWith('_IN_PROGRESS')) {
      const deploymentType =
        stackDescription.Stacks?.[0].Tags?.find(
          (tag) => tag.Key === 'amplify:deployment-type',
        )?.Value ?? 'sandbox';
      throw new BackendOutputClientError(
        BackendOutputClientErrorType.DEPLOYMENT_IN_PROGRESS,
        `This ${deploymentType} deployment is in progress. Re-run this command once the deployment completes.`,
      );
    }
    if (outputs === undefined) {
      throw new BackendOutputClientError(
        BackendOutputClientErrorType.NO_OUTPUTS_FOUND,
        'Stack outputs are undefined',
      );
    }

    // outputs is a list of output entries. here we turn that into a Record<name, value> object
    const stackOutputRecord = outputs
      .filter((output) => !!output.OutputValue && !!output.OutputKey)
      .reduce(
        (accumulator, outputEntry) => ({
          ...accumulator,
          // it's safe to disable this rule because we've already filtered out potentially undefined outputs
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          [outputEntry.OutputKey!]: outputEntry.OutputValue!,
        }),
        {} as Record<string, string>,
      );

    // now we iterate over the metadata entries and reconstruct the data object based on the stackOutputs that each construct package set
    const result: BackendOutput = {};
    Object.entries(backendOutputMetadata).forEach(([outputKeyName, entry]) => {
      const outputData = entry.stackOutputs.reduce(
        (accumulator, outputName) => {
          if (
            stackOutputRecord[outputName] === undefined ||
            stackOutputRecord[outputName] === ''
          ) {
            return accumulator;
          }
          return {
            ...accumulator,
            [outputName]: stackOutputRecord[outputName],
          };
        },
        {} as Record<string, string>,
      );
      result[outputKeyName] = {
        version: entry.version,
        payload: outputData,
      };
    });
    return result;
  };

  /**
   * Filter out stack metadata entries that do not pertain to backend outputs
   */
  private filterBackendOutputEntryStackMetadata<
    T extends Record<string, unknown>,
  >(metadata: T) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) =>
        this.isBackendOutputEntryStackMetadata(value),
      ),
    );
  }

  /**
   * Type predicate to determine if stack metadata entry is like a backend output entry.
   * Zod parsing validation will handle stricter type checking
   */
  private isBackendOutputEntryStackMetadata(
    obj: unknown,
  ): obj is BackendOutputEntryStackMetadata {
    return (
      !!obj &&
      typeof obj === 'object' &&
      'version' in obj &&
      'stackOutputs' in obj
    );
  }
}
