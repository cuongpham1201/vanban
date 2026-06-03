import { IDmsService } from '../services/IDmsService';

export interface IDmsPortalProps {
  /** Data access service. Swap MockDmsService -> SharePointDmsService later. */
  dmsService: IDmsService;
  /** True when rendered inside a Microsoft Teams tab. */
  hasTeamsContext: boolean;
  /** Current user display name (used for the greeting). */
  userDisplayName: string;
}
