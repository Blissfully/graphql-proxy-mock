# GraphQL Proxy Mock

This is a GraphQL caching layer used for debugging and development environments.

It will take graphql resquests and cache the results to a set of flatfiles hashed by integer hash.  Future queries that match that query will receive the result from disk instead of from the DB.


Run locally via:
`yarn install`

and then

`yarn up https://api.blissfully.dev/graphql`

