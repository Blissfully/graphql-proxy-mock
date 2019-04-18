#!/usr/bin/env node

const express = require("express");
const bodyParser = require("body-parser");
const hash = require("object-hash");
const { setContext } = require("apollo-link-context");
const interceptor = require("express-interceptor");
const { ApolloServer, gql } = require("apollo-server-express");
const fs = require('fs-extra')
const program = require('commander');

const {
  makeRemoteExecutableSchema,
  introspectSchema,
  mergeSchemas
} = require("graphql-tools");

const { HttpLink } = require("apollo-link-http");
const fetch = require("node-fetch");

String.prototype.hashCode = function() {
  var hash = 0,
    i,
    chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr = this.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var graphQLSchemaUrl = "https://api.blissfully.com/prod/graphql";

program
  .version('0.1.0')
  .arguments('<target-gql>')
  .action((schemaUrl) => { graphQLSchemaUrl = schemaUrl } )
  .option('-d, --dir <dir>', 'The directory to store and read from. Defaults to `cache`', 'cache')
  .option('-e, --env <env>', 'Save and read responses under an environment tag.  Defaults to `default`', 'default')
  .parse(process.argv);


console.log(`Proxying: ${graphQLSchemaUrl}`);
console.log(`    Saving cache to ./${program.dir}`)
console.log(`    under the tag '${program.env}'`)


async function main() {
  const http = new HttpLink({ uri: graphQLSchemaUrl, fetch });

  const link = setContext((request, previousContext) => {
    if(!previousContext.graphqlContext || !previousContext.graphqlContext.headers) {
      return {}
    }

    return {
      headers: {
        authorization: `${previousContext.graphqlContext.headers.authorization}`
      }
    };
  }).concat(http);

  const remoteSchema = await introspectSchema(link);

  

  const executableRemoteSchema = await makeRemoteExecutableSchema({
    schema: remoteSchema,
    link: link
  });

  // possible workaround for typename issues
  const schema = mergeSchemas({
    schemas: [
      executableRemoteSchema,
    ],
  });

  // In the most basic sense, the ApolloServer can be started
  // by passing type definitions (typeDefs) and the resolvers
  // responsible for fetching the data for those types.
  const server = new ApolloServer({ schema, context: ({req}) => ({headers: req ? req.headers : null}) });

  const app = express();

  // parse application/json
  app.use(bodyParser.json());

  const objReplaceByHash = {};

  app.use(function(req, res, next) {
    console.log(req.headers);

    if (!req.body) {
      console.log("No body");
      return next();
    }

    // Don't do special work for options
    if (req.method == "OPTIONS") {
      return next();
    }

    if (req.body.query) {
      req.queryHash = req.body.query.hashCode();
    } else if (req.query.query) {
      req.queryHash = req.query.query.hashCode();
    }

    if (req.queryHash) {
      console.log("hashes as ", req.queryHash);

      const requestFolder = `${program.dir}/${req.queryHash}`
      if (fs.existsSync(requestFolder)) {
        const responseFile = `${requestFolder}/responses/${program.env}.json`
        const cacheValue = fs.readFileSync(responseFile, 'utf8')
        console.log(`Returning from hash cache: ${req.queryHash}`);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(200).send(cacheValue).send;
      }
    }

    //default
    return next();
  });

  app.set("etag", false);

  // Add the interceptor middleware
  app.use(
    interceptor(function(req, res) {
      return {
        // Only HTML responses will be intercepted
        isInterceptable: function() {
          return /application\/json/.test(res.get("Content-Type")) && req.queryHash;
        },
        // Appends a paragraph at the end of the response body
        intercept: function(body, send) {
          console.log("Intercepting response & caching");

          const queryFolder = `${program.dir}/${req.queryHash}`
          const responseFilename = `${queryFolder}/responses/${program.env}.json`
          const requestFilename = `${queryFolder}/request.json`
          fs.outputJson(responseFilename, JSON.parse(body), {spaces:2}, (err) => {
            if(err) {
              console.log({err})
            }
            console.log(`Wrote: ${responseFilename}`)
          })
          fs.outputJson(requestFilename, {query:req.query, body:req.body}, {spaces:2}, (err) => {
            if(err) {
              console.log({err})
            }
            console.log(`Wrote: ${requestFilename}`)
          })

          // objReplaceByHash[req.queryHash] = body;
          send(body);
        }
      };
    })
  );

  server.applyMiddleware({
    app: app
  });

  app.listen({ port: 4000 }, () => {
    console.log(
      `🚀  Server ready at http://localhost:4000${server.graphqlPath}`
    );
  });
}

(async () => {
  var text = await main();
  console.log(text);
})().catch(e => {
  // Deal with the fact the chain failed
  console.log(e);
});
