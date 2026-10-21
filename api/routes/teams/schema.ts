import { GraphQLBoolean, GraphQLFloat, GraphQLID, GraphQLObjectType, GraphQLString } from 'graphql';
import { JSONScalar } from '../graphql/scalar.js';
import { nonNull, nonNullList } from '../graphql/types.js';
import { read, type GraphQLContext } from '../graphql/context.js';
import { listTeams, getAccount } from './queries.js';
import { isAdmin } from '../../plugins/auth/identity.js';

const Invitation = new GraphQLObjectType({
  name: 'Invitation',
  description: 'A player invitation attached to a team.',
  fields: {
    username: { type: nonNull(GraphQLString), description: 'Invited player display name.' },
    status: { type: nonNull(GraphQLString), description: 'Invitation status.' },
    respondedAt: { type: GraphQLFloat, description: 'Response time in epoch milliseconds.' },
  },
});

const Team = new GraphQLObjectType({
  name: 'Team',
  description: 'A league team with its visible roster and review state.',
  fields: {
    id: { type: nonNull(GraphQLID), description: 'Stable team identifier.' },
    name: { type: nonNull(GraphQLString), description: 'Team name.' },
    tag: { type: nonNull(GraphQLString), description: 'Short team label.' },
    color: { type: GraphQLString, description: 'Team display color.' },
    description: { type: GraphQLString, description: 'Team description.' },
    ownerUsername: { type: nonNull(GraphQLString), description: 'Team captain display name.' },
    members: { type: nonNullList(GraphQLString), description: 'Visible roster names.' },
    invitations: { type: nonNullList(Invitation), description: 'Visible roster invitations.' },
    pendingMembers: { type: nonNullList(GraphQLString), description: 'Names with pending or accepted invitations.' },
    totw: { type: nonNull(GraphQLBoolean), description: 'Whether the team holds the current team of the week title.' },
    totwSetAt: { type: GraphQLFloat, description: 'Team of the week selection time in epoch milliseconds.' },
    seasons: { type: nonNullList(GraphQLString), description: 'Seasons excluded from team participation.' },
    formation: { type: nonNull(GraphQLString), description: 'Team formation identifier.' },
    lineup: { type: nonNull(JSONScalar), description: 'Formation slot to player name mapping.' },
    status: { type: nonNull(GraphQLString), description: 'Review status.' },
    logoUrl: { type: GraphQLString, description: 'Team logo URL.' },
    createdAt: { type: GraphQLFloat, description: 'Creation time in epoch milliseconds.' },
    reviewedAt: { type: GraphQLFloat, description: 'Review time in epoch milliseconds.' },
    reviewedBy: { type: GraphQLString, description: 'Reviewing administrator.' },
    rejectionReason: { type: GraphQLString, description: 'Reason for rejection, if rejected.' },
  },
});

export const queryFields = {
  teams: {
    type: nonNullList(Team),
    description: 'Teams visible to the current viewer.',
    resolve: (_source: unknown, _args: unknown, context: GraphQLContext) =>
      read(context, 'teams', async () => {
        const self = context.request.identity ? await getAccount(context.db, context.request.identity.id) : null;
        return listTeams(context.db, { id: self?.id, admin: isAdmin(context.request) });
      }),
  },
};

export const types = { Team, Invitation };
