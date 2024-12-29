import {
  IResource,
  Lazy,
  Names,
  Resource,
  Stack,
  aws_memorydb,
  SecretValue,
  Token,
  aws_iam,
  ArnFormat,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * An User
 */
export interface IUser extends IResource {
  /**
   * The ARN of the user.
   *
   * @attribute
   */
  readonly userArn: string;

  /**
   * The name of the user.
   *
   * @attribute
   */
  readonly userName: string;

  /**
   * Grant the given identity the specified actions
   */
  grant(grantee: aws_iam.IGrantable, ...actions: string[]): aws_iam.Grant;

  /**
   * Grant the given identity connection access to the DB.
   */
  grantConnect(grantee: aws_iam.IGrantable): aws_iam.Grant;
}

/**
 * Authentication type.
 */
export enum AuthenticationType {
  /**
   * Password required.
   */
  PASSWORD = 'password',

  /**
   * IAM authentication.
   */
  IAM = 'iam',
}

/**
 * Properties for defining an User.
 */
export interface UserProps {
  /**
   * The username of the user.
   *
   * The name is required, can have up to 40 characters, and must begin with a letter. It should not end with a hyphen or contain two consecutive hyphens. Valid characters: A-Z, a-z, 0-9, and -(hyphen)
   *
   * @default - auto generate
   */
  readonly userName?: string;

  /**
   * Access permissions string used for this user.
   *
   * @default - 'off -@all'
   * @see https://docs.aws.amazon.com/memorydb/latest/devguide/clusters.acls.html#access-string
   */
  readonly accessString?: string;

  /**
   * Specifies the authentication type.
   */
  readonly authenticationType: AuthenticationType;

  /**
   * Passwords used for this user account.
   * You can create up to two passwords for each user.
   *
   * You must set at least one password when `authenticatipnType` is set to `AuthenticationType.PASSWORD`
   *
   * @default - no passwords for this user
   */
  readonly passwords?: SecretValue[];
}

/**
 * Attributes for importing an User.
 */
export interface UserAttributes {
  /**
   * The name of the user.
   */
  readonly userName: string;
}

/**
 * A new or imported User.
 */
export abstract class UserBase extends Resource implements IUser {
  /**
   * Imports an existing User from attributes
   */
  public static fromUserAttributes(scope: Construct, id: string, attrs: UserAttributes): IUser {
    class Import extends UserBase implements IUser {
      public readonly userName = attrs.userName;
      public readonly userArn = Stack.of(this).formatArn({
        service: 'memorydb',
        resource: 'user',
      });
    }
    return new Import(scope, id);
  }

  /**
   * The ARN of the user.
   */
  public abstract readonly userArn: string;

  /**
   * The name of the user.
   */
  public abstract readonly userName: string;

  /**
   * Grant the given identity the specified actions
   * @param grantee the identity to be granted the actions
   * @param actions the data-access actions
   *
   * @see https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonmemorydb.html#amazonmemorydb-actions-as-permissions
   */
  public grant(grantee: aws_iam.IGrantable, ...actions: string[]): aws_iam.Grant {
    return aws_iam.Grant.addToPrincipal({
      grantee,
      actions,
      resourceArns: [
        Stack.of(this).formatArn({
          service: 'memorydb',
          resource: 'user',
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
      ],
    });
  }

  /**
   * Permits an IAM principal to perform connect to the user.
   *
   * Actions: Connect
   *
   * @param grantee The principal to grant access to.
   * @see https://docs.aws.amazon.com/memorydb/latest/devguide/iam.identitybasedpolicies.html#allow-unrestricted-access
   */
  public grantConnect(grantee: aws_iam.IGrantable): aws_iam.Grant {
    return this.grant(grantee, 'memorydb:Connect');
  }
}

/**
 * Represents an User construct in AWS CDK.
 *
 * @example
 *
 * const user = new User(
 *   stack,
 *   'User',
 *   {
 *     authenticationType: AuthenticationType.IAM,
 *   },
 * );
 */
export class User extends UserBase implements IUser {
  /**
   * The ARN of the user.
   */
  readonly userArn: string;

  /**
   * The name of the user.
   */
  readonly userName: string;

  private readonly props: UserProps;

  constructor(scope: Construct, id: string, props: UserProps) {
    super(scope, id, {
      physicalName:
        props.userName ??
        Lazy.string({
          produce: () => Names.uniqueResourceName(this, { separator: '-', maxLength: 40 }).toLowerCase(),
        }),
    });
    this.props = props;

    this.validateUserName();
    this.validateAuthenticationSettings();

    const user = this.createResource(this, 'Resource', {
      userName: this.props.userName ?? this.physicalName,
      accessString: this.props.accessString ?? 'off -@all',
      authenticationMode: this.renderAuthenticationMode(),
    });

    this.userArn = user.attrArn;
    this.userName = user.userName;
  }

  protected createResource(scope: Construct, id: string, props: aws_memorydb.CfnUserProps): aws_memorydb.CfnUser {
    return new aws_memorydb.CfnUser(scope, id, props);
  }

  /**
   * Render `authenticationMode` property.
   *
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_memorydb.CfnUser.html#authenticationmode
   */
  protected renderAuthenticationMode(): { [key: string]: any } {
    const authenticationMode: { Type: string; Passwords?: string[] } = {
      Type: this.props.authenticationType,
    };

    if (this.props.passwords) {
      authenticationMode.Passwords = this.props.passwords.map(password => password.unsafeUnwrap());
    }

    return authenticationMode;
  }

  /**
   * Validates user name.
   */
  private validateUserName(): void {
    const userName = this.props.userName;
    if (Token.isUnresolved(userName) || userName === undefined) {
      return;
    }

    if (userName.length < 1 || userName.length > 40) {
      throw new Error(`\`userName\` must be between 1 and 40 characters, got ${userName.length} characters.`);
    }

    if (!/^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/.test(userName)) {
      throw new Error(
        `\`userName\` must consist only of alphanumeric characters or hyphens, with the first character as a letter, and it can't end with a hyphen or contain two consecutive hyphens, got: ${userName}.`,
      );
    }
  }

  /**
   * Validates authentication settings.
   */
  private validateAuthenticationSettings(): void {
    const authenticationType = this.props.authenticationType;
    const passwords = this.props.passwords;
    const userName = this.props.userName;

    if (authenticationType === AuthenticationType.PASSWORD && !passwords) {
      throw new Error(
        'At least one password must be set to `passwords` when `authenticationType` is set to `AuthenticationType.PASSWORD`.',
      );
    }

    if (authenticationType !== AuthenticationType.PASSWORD && passwords) {
      throw new Error('`passwords` can only be set when `authenticationType` is set to `AuthenticationType.PASSWORD`.');
    }
  }
}
