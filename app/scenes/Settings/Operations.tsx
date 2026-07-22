import { observer } from "mobx-react";
import { ShieldIcon } from "outline-icons";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import Button from "~/components/Button";
import Empty from "~/components/Empty";
import { ConditionalFade } from "~/components/Fade";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import Time from "~/components/Time";
import useStores from "~/hooks/useStores";
import type Event from "~/models/Event";
import type Model from "~/models/base/Model";
import { PAGINATION_SYMBOL } from "~/stores/base/Store";
import { appendUniqueById, getAuditChanges } from "./AuditLogUtils";

const PAGE_SIZE = 25;

function Operations() {
  const { t } = useTranslation();
  const { events } = useStores();
  const [auditEvents, setAuditEvents] = useState<Event<Model>[]>([]);
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasNext, setHasNext] = useState(false);

  const fetchAuditEvents = useCallback(
    async (nextOffset: number) => {
      setLoading(true);
      setFailed(false);

      try {
        const response = await events.fetchPage({
          auditLog: true,
          sort: "createdAt",
          direction: "DESC",
          offset: nextOffset,
          limit: PAGE_SIZE,
        });
        const pagination = response[PAGINATION_SYMBOL];

        setAuditEvents((current) =>
          nextOffset === 0 ? response : appendUniqueById(current, response)
        );
        setOffset(nextOffset);
        setHasNext(
          !!pagination && nextOffset + response.length < pagination.total
        );
      } catch {
        setFailed(true);
      } finally {
        setLoaded(true);
        setLoading(false);
      }
    },
    [events]
  );

  const handleLoadMore = useCallback(() => {
    void fetchAuditEvents(offset + PAGE_SIZE);
  }, [fetchAuditEvents, offset]);

  useEffect(() => {
    void fetchAuditEvents(0);
  }, [fetchAuditEvents]);

  useEffect(() => {
    if (failed) {
      toast.error(t("Could not load the audit log"));
    }
  }, [failed, t]);

  return (
    <Scene title={t("Audit Log")} icon={<ShieldIcon />}>
      <Heading>{t("Audit Log")}</Heading>
      <Text as="p" type="secondary">
        {t(
          "The audit log details the history of security related and other events across your knowledge base."
        )}
      </Text>
      <ConditionalFade animate={!loaded}>
        <>
          {auditEvents.length ? (
            <AuditEvents>
              {auditEvents.map((event) => (
                <AuditEvent key={event.id} event={event} />
              ))}
            </AuditEvents>
          ) : (
            <Empty as="p">
              {loading || !loaded ? t("Loading…") : t("No audit events yet")}
            </Empty>
          )}
        </>
      </ConditionalFade>
      {hasNext && (
        <LoadMore>
          <Button neutral disabled={loading} onClick={handleLoadMore}>
            {t("Load more")}
          </Button>
        </LoadMore>
      )}
    </Scene>
  );
}

function AuditEvent({ event }: { event: Event<Model> }) {
  const { t } = useTranslation();
  const changes = getAuditChanges(event.changes);
  const target = getAuditTarget(event);

  return (
    <AuditEventItem>
      <EventName>{event.name}</EventName>
      <Metadata>
        <div>
          <dt>{t("Actor")}</dt>
          <dd>{event.actor?.name ?? event.actorId}</dd>
        </div>
        {event.actorIpAddress && (
          <div>
            <dt>{t("IP address")}</dt>
            <dd>{event.actorIpAddress}</dd>
          </div>
        )}
        {target && (
          <div>
            <dt>{t(target.type)}</dt>
            <dd>{target.id}</dd>
          </div>
        )}
        <div>
          <dt>{t("Time")}</dt>
          <dd>
            <Time dateTime={event.createdAt} relative addSuffix />
          </dd>
        </div>
      </Metadata>
      {changes.length > 0 && (
        <Changes>
          <summary>
            {t("Changed fields ({{count}})", { count: changes.length })}
          </summary>
          <ChangeList>
            {changes.map((change) => (
              <li key={change.attribute}>
                <strong>{change.attribute}</strong>
                <span>{change.previousValue}</span>
                <Arrow aria-hidden="true">→</Arrow>
                <span>{change.value}</span>
              </li>
            ))}
          </ChangeList>
        </Changes>
      )}
    </AuditEventItem>
  );
}

function getAuditTarget(event: Event<Model>) {
  if (event.documentId) {
    return {
      type: "Document",
      id: event.documentId,
    };
  }

  if (event.collectionId) {
    return {
      type: "Collection",
      id: event.collectionId,
    };
  }

  if (event.userId) {
    return {
      type: "User",
      id: event.userId,
    };
  }

  if (event.modelId) {
    return {
      type: "Object",
      id: event.modelId,
    };
  }

  return undefined;
}

const AuditEvents = styled.ol`
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
`;

const AuditEventItem = styled.li`
  border-top: 1px solid ${(props) => props.theme.divider};
  padding: 16px 0;
`;

const EventName = styled.code`
  font-size: 14px;
  font-weight: 500;
`;

const Metadata = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin: 10px 0 0;
  font-size: 13px;

  div {
    display: flex;
    gap: 6px;
    min-width: 0;
  }

  dt {
    color: ${(props) => props.theme.textTertiary};
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`;

const Changes = styled.details`
  margin-top: 12px;

  summary {
    color: ${(props) => props.theme.textSecondary};
    cursor: var(--pointer);
  }
`;

const ChangeList = styled.ul`
  display: grid;
  gap: 6px;
  list-style: none;
  margin: 10px 0 0;
  padding: 0;

  li {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto minmax(0, 2fr);
    gap: 8px;
    align-items: baseline;
    font-family: ${(props) => props.theme.fontFamilyMono};
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  @media (max-width: 600px) {
    li {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
`;

const Arrow = styled.span`
  color: ${(props) => props.theme.textTertiary};
`;

const LoadMore = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 16px;
`;

export default observer(Operations);
