import { IResource, Resource, aws_fis, aws_s3, aws_logs, aws_iam, aws_cloudwatch } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IFisAction } from './action';
import { IFisTarget } from './target';

/**
 */
export interface IExperimentTemplate extends IResource {
  /**
   *
   * @attribute
   */
}

export interface StopCondition {
  source: '';
  value?: aws_cloudwatch.IAlarm;
}

export interface LogConfiguration {
  readonly logSchemaVersion: number;
  readonly cloudWatchLogLoggingEnabled: boolean;
  readonly cloudwatchLogGroup?: aws_logs.ILogGroup;
  readonly s3LoggingEnabled: boolean;
  readonly s3LoggingBucket?: aws_s3.IBucket;
  readonly s3LoggingPrefix?: string;
}

export enum AccountTargeting {
  MULTI_ACCOUNT = 'multi-account',
  SINGLE_ACCOUNT = 'single-account',
}

export enum EmptyTargetResolutionMode {
  FAIL = 'fail',
  SKIP = 'skip',
}

export interface ExperimentTemplateProps {
  readonly description: string;
  readonly role: aws_iam.IRole;
  readonly stopConditions: StopCondition[];
  readonly targets: IFisTarget[];
  readonly actions?: IFisAction[];
  readonly accountTargeting: AccountTargeting;
  readonly emptyTargetResolutionMode: EmptyTargetResolutionMode;
  readonly logConfiguration?: LogConfiguration;
}

export class ExperimentTemplate extends Resource implements IExperimentTemplate {

  private readonly props: ExperimentTemplateProps;

  private readonly fisRole: aws_iam.IRole;

  private readonly cloudWatchLogsGroup: aws_logs.ILogGroup;
  private readonly s3LoggingBucket: aws_s3.IBucket;

  constructor(scope: Construct, id: string, props: ExperimentTemplateProps) {
    super(scope, id);
    this.props = props;

    this.fisRole = props.role ||
      new aws_iam.Role(this, 'Role', {
        assumedBy: new aws_iam.ServicePrincipal('pipes.amazonaws.com'),
      });

    if (this.props.logConfiguration?.cloudWatchLogLoggingEnabled) {
      this.cloudWatchLogsGroup = this.props.logConfiguration.cloudwatchLogGroup ?? new aws_logs.LogGroup(this, 'AppLogs', {
        retention: aws_logs.RetentionDays.ONE_MONTH,
      });
    }

    if (this.props.logConfiguration?.s3LoggingEnabled) {
      this.s3LoggingBucket = this.props.logConfiguration.s3LoggingBucket ?? new aws_s3.Bucket(this, 'ArtifactsBucket', {
        encryption: aws_s3.BucketEncryption.KMS_MANAGED,
      });
    }

    this.createExperimentTemplate();
  }

  private createExperimentTemplate(): aws_fis.CfnExperimentTemplate {
    return new aws_fis.CfnExperimentTemplate(this, 'Resource', {
      description: this.props.description,
      roleArn: this.fisRole.roleArn,
      stopConditions: this.renderConditions(),
      targets: {
        tartsKey: {
          resourceType: 'resourceType',
          selectionMode: 'selectionMode',

          // the properties below are optional
          filters: [{
            path: 'path',
            values: ['values'],
          }],
          parameters: {
            parametersKey: 'parameters',
          },
          resourceArns: ['resourceArns'],
          resourceTags: {
            resourceTagsKey: 'resourceTags',
          },
        },
      },
      actions: {
        actionsKey: {
          actionId: 'actionId',

          // the properties below are optional
          description: 'description',
          parameters: {
            parametersKey: 'parameters',
          },
          startAfter: ['startAfter'],
          targets: {
            targetsKey: 'targets',
          },
        },
      },
      experimentOptions: {
        accountTargeting: this.props.accountTargeting,
        emptyTargetResolutionMode: this.props.emptyTargetResolutionMode,
      },
      logConfiguration: this.props.logConfiguration ? this.renderLogConfiguration(this.props.logConfiguration) : undefined,
    });
  }

  private renderConditions(): aws_fis.CfnExperimentTemplate.ExperimentTemplateStopConditionProperty[] {
    return this.props.stopConditions.map(s => ({
      source: s.source,
      value: s.value?.alarmArn,
    }));
  }

  private renderLogConfiguration(logConfiguration: LogConfiguration): aws_fis.CfnExperimentTemplate.ExperimentTemplateLogConfigurationProperty {
    return {
      logSchemaVersion: logConfiguration?.logSchemaVersion,
      cloudWatchLogsConfiguration: {
        logGroupArn: this.cloudWatchLogsGroup.logGroupArn,
      },
      s3Configuration: {
        bucketName: this.s3LoggingBucket.bucketArn,
        prefix: this.props.logConfiguration?.s3LoggingPrefix,
      },
    };
  }


}

