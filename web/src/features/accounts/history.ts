import { AccountMatchesDocument, AccountOpponentsDocument } from '../../api/generated/graphql';
import { graphql } from '../../api/graphql';
import { accountMatchPageSchema, accountOpponentsSchema } from '@napl/contracts/accounts';

export async function loadAccountMatchPage(id: string, after: string | null, season: string | null = null, opponent: string | null = null, force = false) {
  const data = await graphql(AccountMatchesDocument, { id, first: 25, after, season, opponent }, { force });
  const parsed = accountMatchPageSchema.safeParse(data.accountMatches);
  if (!parsed.success) throw new Error('Invalid GraphQL match history data.');
  return parsed.data;
}

export async function loadAccountOpponents(id: string, force = false) {
  const data = await graphql(AccountOpponentsDocument, { id }, { force });
  const parsed = accountOpponentsSchema.safeParse(data.accountOpponents);
  if (!parsed.success) throw new Error('Invalid GraphQL opponent summary data.');
  return parsed.data;
}
