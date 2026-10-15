import type { NewsFieldsFragment } from '../../api/generated/graphql';
import type { News } from './models';

export const mapNews = (row: NewsFieldsFragment): News => ({
  ...row, notes: row.notes ?? '', createdAt: row.createdAt ?? 0,
});
