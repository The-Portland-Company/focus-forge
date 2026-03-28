export type TimeScope = "read" | "write" | "admin";
export type TimeTokenShareMode = "private" | "organization" | "selected";

export interface TimeTrackingGroup {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  memberIds: string[];
}

export interface TimeTrackingToken {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  prefix: string;
  maskedKey: string;
  scopes: TimeScope[];
  expiresAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  shareMode: TimeTokenShareMode;
  sharedUserIds: string[];
  sharedGroupIds: string[];
}

export interface TimeTrackingTokenWithSecret extends TimeTrackingToken {
  secret: string;
}

export interface TimeTrackingUserOption {
  id: string;
  name: string;
  email: string;
  role: "team_member" | "admin" | "super_admin" | null;
}

export interface TimeTrackingTaskOption {
  id: string;
  name: string;
  projectId: string | null;
  sectionId: string | null;
}

export interface TimeTrackingSectionOption {
  id: string;
  name: string;
  projectId: string;
}

export interface TimeTrackingProjectOption {
  id: string;
  name: string;
  organizationId: string;
}

export interface TimeTrackingOrganizationOption {
  id: string;
  name: string;
}

export interface TimeTrackingEntry {
  id: string;
  organizationId: string;
  userId: string;
  projectId: string | null;
  sectionId: string | null;
  title: string;
  description: string | null;
  timezone: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  taskIds: string[];
  source: string;
  sourceMetadata: Record<string, unknown>;
  user?: TimeTrackingUserOption | null;
  project?: TimeTrackingProjectOption | null;
  section?: TimeTrackingSectionOption | null;
  organization?: TimeTrackingOrganizationOption | null;
  tasks?: TimeTrackingTaskOption[];
}

export interface TimeTrackingBootstrap {
  organizations: TimeTrackingOrganizationOption[];
  projects: TimeTrackingProjectOption[];
  sections: TimeTrackingSectionOption[];
  tasks: TimeTrackingTaskOption[];
  users: TimeTrackingUserOption[];
  groups: TimeTrackingGroup[];
  timeTokens: TimeTrackingToken[];
}
