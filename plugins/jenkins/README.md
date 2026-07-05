# Jenkins Collector Plugin

Optional Jenkins collector for Spaghetti Desk.

Install it into the backend environment only when a deployment uses Jenkins:

```bash
cd backend
uv pip install -e ../plugins/jenkins
```

Enable it in private deployment config, not in the public repository:

```yaml
collectors:
  enabled: true
  plugins:
    jenkins:
      enabled: true
      interval_seconds: 300
      base_url: ${JENKINS_URL}
      username_env: JENKINS_USERNAME
      token_env: JENKINS_TOKEN
      job_include_patterns:
        - "platform-*"
      default_owner_team: Platform
```

The plugin reads Jenkins job metadata and writes normalized pipeline records to
the local Spaghetti Desk database. The UI/API should read that local state; it
should not call Jenkins during normal page rendering.
