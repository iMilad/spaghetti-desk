# Public and Private Data Boundaries

Spaghetti Desk is intended to be public. The public repository must remain free
of private company information.

## Public Repository

Safe content:

- Source code
- Tests
- Fake demo data
- Example configuration
- Docker Compose files for local development
- Documentation
- CI workflows

## Private Deployments

Private deployments can maintain their own local configuration, real inventory,
secrets, and company-specific collectors outside the public repository.

For example, a company-specific downstream folder can track internal settings
and be upgraded from public Spaghetti Desk releases without pushing private data
back into the public project.

## Never Commit

- Real hostnames
- Real IP addresses
- Internal URLs
- Usernames or emails
- Tokens or credentials
- License data
- Inventory exports
- Private documentation
- Agent session summaries that mention internal systems

