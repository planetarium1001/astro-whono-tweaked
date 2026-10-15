/** 可空日期倒序比较：空值排在末尾。 */
export const compareByNullableDateDesc = (left: Date | null, right: Date | null): number => {
  if (left && right) return right.valueOf() - left.valueOf();
  if (left) return -1;
  if (right) return 1;
  return 0;
};

export type {
  AdminAboutEditorPayload,
  AdminAboutEditorValues
} from './content-about-contract';

export type { AdminContentValidationIssue } from './content-entry-contract';

export {
  ADMIN_CONTENT_COLLECTION_KEYS,
  ADMIN_CONTENT_BODY_IMAGE_UPLOAD_COLLECTION_KEYS,
  ADMIN_CONTENT_CREATABLE_COLLECTION_KEYS,
  ADMIN_CONTENT_DELETABLE_COLLECTION_KEYS,
  ADMIN_CONTENT_ENTRY_WRITE_COLLECTION_KEYS,
  ADMIN_CONTENT_EXPORTABLE_COLLECTION_KEYS,
  ADMIN_CONTENT_IMAGE_UPLOAD_COLLECTION_KEYS,
  ADMIN_CONTENT_WRITE_COLLECTION_KEYS,
  getAdminContentCollectionCapability,
  getAdminContentFixedPageCapability,
  isAdminContentBodyImageUploadCollectionKey,
  isAdminContentCollectionKey,
  isAdminContentCreatableCollectionKey,
  isAdminContentDeletableCollectionKey,
  isAdminContentEntryWriteCollectionKey,
  isAdminContentExportableCollectionKey,
  isAdminContentImageUploadCollectionKey,
  isAdminContentWriteCollectionKey
} from './content-collections';
export type {
  AdminContentBodyImageUploadCollectionKey,
  AdminContentCollectionKey,
  AdminContentCreatableCollectionKey,
  AdminContentEntryWriteCollectionKey,
  AdminContentExportableCollectionKey,
  AdminContentImageUploadCollectionKey,
  AdminContentWriteCollectionKey
} from './content-collections';

export {
  AdminContentEntryResolutionError,
  getAdminContentReadOnlyReason,
  listAdminCollectionSourceFiles,
  loadAdminContentSourceState,
  readAdminSourceFrontmatterRecord,
  resolveAdminContentEntryIdFromSourcePath,
  resolveAdminContentEntryLegacySourcePath,
  resolveAdminContentEntrySourcePath,
  toAdminContentAbsoluteProjectPath,
  toAdminContentRelativeProjectPath
} from './content-entry-source';
export type {
  AdminContentEntryResolutionErrorCode,
  AdminContentSourceState
} from './content-entry-source';

export {
  buildAdminContentEntryEditorPayloadFromState,
  readAdminContentEntryEditorPayload
} from './content-editor-payload';
export type {
  AdminBitsEditorPayload,
  AdminBitsEditorValues,
  AdminContentEditorPayload,
  AdminContentEditorValues,
  AdminContentWorkspaceEditorPayload,
  AdminContentWorkspaceEditorValues,
  AdminBlogEditorPayload,
  AdminBlogEditorValues
} from './content-editor-payload';

export {
  applyAdminContentWritePlan,
  buildAdminContentWritePlanFromState
} from './content-write-plan';
