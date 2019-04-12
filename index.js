const express = require("express");
const bodyParser = require('body-parser')

const { ApolloServer, gql } = require('apollo-server-express');

const {
  makeRemoteExecutableSchema,
  introspectSchema,
  mergeSchemas
} = require('graphql-tools');

const { HttpLink } = require('apollo-link-http')
const fetch = require('node-fetch');

const graphQLSchemaUrl = 'https://api.blissfully.com/prod/graphql'

async function main () {
  const link = new HttpLink({ uri: graphQLSchemaUrl, fetch })
  const remoteSchema = await introspectSchema(link)
  const schema = await makeRemoteExecutableSchema({
    schema: remoteSchema,
    link: link
  });
  
  // In the most basic sense, the ApolloServer can be started
  // by passing type definitions (typeDefs) and the resolvers
  // responsible for fetching the data for those types.
  const server = new ApolloServer({ schema });
  
  const app = express()

  // parse application/json
  app.use(bodyParser.json())


  app.use(function(req,res,next){
    console.log({body:req.body})

    if(req.body.query && req.body.query == 'query {\n  loginURL\n}') {
      console.log("Woot")
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        data: {
          loginURL: "foo"
        }
      }
        , null, 2))
    }
    else{
      next()
    }
  })

  server.applyMiddleware({
    app: app
  })

  app.listen({ port:4000}, () => {
    console.log(`🚀  Server ready at http://localhost:4000${server.graphqlPath}`);
  });
}

(async () => {
  var text = await main();
  console.log(text);
})().catch(e => {
  // Deal with the fact the chain failed
  console.log(e)
});