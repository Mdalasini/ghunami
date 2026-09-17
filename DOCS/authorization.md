# Overview

The Authorization API generates access tokens required for authenticating API calls.

**Key Features:**

- OAuth 2.0 Authentication
- Token Expiry: 3600 seconds
- Supports Automated Testing via the Simulator
- Simulator: Developers can automatically generate tokens by selecting an app in the simulator section, where keys auto-populate.
- Postman Collection: Developers can also obtain their Consumer Key and Consumer Secret from the Daraja [My Apps](https://developer.safaricom.co.ke/dashboard/myapps) page and use them for manual authentication.

  **Note:** This API must be called before any other API in the Daraja platform, as all other APIs require an access token for authentication.

# How It Works

- A developer retrieves the Consumer Key and Consumer Secret from the Daraja Portal.
- The developer sends a request to the Authorization API using Basic Authentication.
- The API validates credentials and returns an access token.
- The token is then used in subsequent API calls.

# Getting Started

## Prerequisites

- Create a Daraja Account on [Safaricom Developer Portal](https://developer.safaricom.co.ke/).
- Create an sandbox app in the portal to get API credentials.
- Retrieve Consumer Key & Consumer Secret from your sandbox app on [My Apps](https://developer.safaricom.co.ke/dashboard/myapps).

## Good to Know

- Token Expiry: Tokens expires after 3600 seconds (1 hour).

# Environments

| Environment | Description                          |
| ----------- | ------------------------------------ |
| Sandbox     | Testing environment.                 |
| Production  | Live environment for real transactions. |

# Integration Steps

Generate an OAuth Access Token

All API calls require a Bearer Token obtained from the Authorization API.

## Request Body

```text
// AUTHORIZATION (Basic Auth)
username
password
// HEADERS
{
  "Authorization": "Basic Q2RtTmJkdDBpQk4xb3FEZkthc200..."
}

// PARAMS
grant_type;
client_credentials;
```

### Request Parameter Definition

| Name       | Description                                                        | Type  | Sample Values      |
| ---------- | ------------------------------------------------------------------ | ----- | ------------------ |
| grant_type | The client_credentials grant type is supported. Put this under Params. | Query | client_credentials |

## Response Body

```json
{
  "access_token": "c9SQxWWhmdVRlyh0zh8gZDTkubVF",
  "expires_in": 3599
}
```

### Response Parameter Definition

| Name         | Description                     | Type               | Sample Values              |
| ------------ | ------------------------------- | ------------------ | -------------------------- |
| access_token | Access token to access the APIs | JSON Response Item | c9SQxWWhmdVRlyh0zh8gZDTkubVF |
| expires_in   | Token expiry time in seconds    | JSON Response Item | 3599                       |

### Error Response Parameter Definition

| Name      | Description                        | Probable Cause              | Mitigation plan                        |
| --------- | ---------------------------------- | --------------------------- | -------------------------------------- |
| 400.008.02 | Invalid grant type passed         | Incorrect grant type        | Select grant type as client Credentials |
| 400.008.01 | Invalid authentication type passed | Incorrect Authorisation type | Select authorization type as Basic     |

# Testing

Using the Simulator

- Safaricom provides an Authorization API Simulator for testing access token generation.
- Access the simulator via the Daraja Portal.

Steps to Test

- Select one of your apps to simulate.
- Use simulator to invoke requests to the API
- Check response for success or to resolve any errors.

# Support

## FAQs

- Why is my access token not working?
  - Tokens expire in 3600 seconds. Generate a new one if expired.
- What should I do if I get an invalid grant type error?
  - Ensure grant_type is set to client_credentials.
- Can I generate multiple tokens?
  - Yes, but each request invalidates the previous token.

## Chatbot

Developers can get instant responses using the Daraja Chatbot for both development and production support.

## Production Issues & Incident Management

For production support and incident management, use:

- Incident Management Page: Visit the [Incident Management](https://developer.safaricom.co.ke/dashboard/incidentmanagement) page.
- Email: Reach out to API support at [apisupport@safaricom.co.ke](mailto:apisupport@safaricom.co.ke).
