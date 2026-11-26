export interface DocumentNode {
  id: string
  orderIndex: number
  headingPath: string
  sectionCode: string
  title: string
  fullContent: string
  pairedDocContent?: string
  isImpacted: boolean
  circularComplianceNote?: string
}

export interface ExpectedSection {
  code: string
  title: string
  keywords: string[]
  mandatoryRule?: string
}

export interface CircularFramework {
  id: string
  name: string
  authority: 'SEBI' | 'RBI' | 'Other'
  circularRef: string
  effectiveDate: string
  documentTypes: [string, string]
  expectedSections: ExpectedSection[]
  complianceChecklist: string[]
  isCustom?: boolean
}

export interface AmendmentNotice {
  id: string
  fileName: string
  noticeNumber: string
  noticeDate: string
  effectiveDate: string
  impactedScope: string
  targetNodeId: string
  targetHeading: string
  originalExcerpt: string
  proposedText: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedAt?: string
}

export interface ReconcilerWorkspaceData {
  frameworks: CircularFramework[]
  documentNodes: DocumentNode[]
  notices: AmendmentNotice[]
  primaryFileName?: string
  secondaryFileName?: string
  isSampleMode?: boolean
}
