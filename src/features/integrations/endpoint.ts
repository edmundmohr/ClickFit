/**
 * Angaben zur Import-Route für die Anleitungen: Adresse, Header und das Beispiel für Home Assistant.
 * Die Texte hier sind technischer Inhalt (URL, Header, YAML), keine Oberflächentexte.
 */
import { HEALTH_IMPORT_PATH } from "./constants";

export const HTTP_METHOD = "POST";
export const AUTH_HEADER_NAME = "Authorization";

/** Vollständige Adresse der Import-Route. */
export function importEndpoint(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${HEALTH_IMPORT_PATH}`;
}

/** Zeile des Headers, wie sie in der sendenden App einzutragen ist. */
export function authHeaderLine(token: string): string {
  return `${AUTH_HEADER_NAME}: Bearer ${token}`;
}

/**
 * Beispiel für Home Assistant: ein `rest_command`, der das Gewicht schickt, der Token in
 * `secrets.yaml` und eine Automation, die bei jedem neuen Messwert der Waage auslöst.
 */
export function homeAssistantExample(endpoint: string, tokenPlaceholder: string): string {
  return `# configuration.yaml
rest_command:
  clickfit_weight:
    url: "${endpoint}"
    method: post
    content_type: "application/json"
    headers:
      Authorization: !secret clickfit_token
    payload: '{"weight": {"kg": {{ weight }} }}'

# secrets.yaml
clickfit_token: "Bearer ${tokenPlaceholder}"

# automations.yaml
- alias: "ClickFit: Gewicht senden"
  triggers:
    - trigger: state
      entity_id: sensor.waage_gewicht
  conditions:
    - condition: template
      value_template: "{{ trigger.to_state.state | float(0) > 20 }}"
  actions:
    - action: rest_command.clickfit_weight
      data:
        weight: "{{ trigger.to_state.state | float }}"
`;
}
