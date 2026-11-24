# 🛡️ CloudShield IaC Platform

[![CI/CD Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/tests-23%2F23%20passed-success.svg)]()
[![Release](https://img.shields.io/badge/release-v1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![Architecture](https://img.shields.io/badge/architecture-Clean%20Arch%20%26%20DDD-orange.svg)]()
[![Security](https://img.shields.io/badge/compliance-CIS%20Benchmarks%20%26%20FinOps-purple.svg)]()

> **Enterprise Infrastructure as Code (IaC), Policy-as-Code & Drift Orchestration Engine**  
> Desenvolvido na metodologia de **Sprints Semanais de Engenharia (1 Projeto por Semana com Melhoria Contínua Diária)**.

---

## 🎯 Problema Real de Negócio

Em ecossistemas corporativos de computação em nuvem (AWS, GCP, Azure e Kubernetes), operações manuais (*ClickOps*) e configurações fragmentadas de Terraform geram quatro problemas críticos:

1. **Vulnerabilidades Críticas de Segurança (CIS Benchmarks Violations):** Regras de *Security Group* abertas para a internet pública (`0.0.0.0/0`) expondo portas sensíveis como SSH (22), RDP (3389), PostgreSQL (5432) e Apache Kafka (9092), além de bases de dados sem encriptação em repouso por chave KMS.
2. **Colisão de Endereçamento de Rede (CIDR Overlaps):** Subnets e VPCs criadas com faixas de IP sobrepostas, impossibilitando roteamento via Transit Gateway, VPNs corporativas e conexões inter-VPC.
3. **Descontrole Orçamentário FinOps (Budget Runaway):** Falta de governança em tempo de *plan*, onde recursos superdimensionados violam o teto mensal da organização sem travas atômicas em centavos inteiros (*Integer Cents*).
4. **Drift e Instabilidade de Estado (Configuration Drift):** Máquinas de estado frágeis que aplicam planos sem validações formais ou auditoria de integridade.

---

## 💡 Solução Arquitetural

O **CloudShield IaC Platform** implementa um motor de governança declarativa baseado em **Domain-Driven Design (DDD)** e **Clean Architecture**:

- **Aritmética FinOps em Centavos Inteiros (RN-01):** Orçamentos e custos gerenciados estritamente em inteiros (`Integer Cents`), eliminando desvios de ponto flutuante IEEE 754 e bloqueando commits que excedam o teto corporativo com `FinOpsBudgetExceededError`.
- **Validação Algorítmica de CIDR & Anti-Colisão (RN-02):** Representação bitwise de 32 bits de blocos IPv4 com cálculo de broadcast, rede e detecção determinística de sobreposição (`overlapsWith`).
- **Identificação Canônica de Recursos (RN-03):** URN fortemente tipado no formato `urn:cloudshield:{provider}:{region}:{account}:{service}/{resourceId}` suportando AWS, GCP, Azure e Kubernetes.
- **Blindagem de Segurança Policy-as-Code (RN-04):** Motor de conformidade estrito que valida regras de rede contra padrões CIS 4.1/4.2 e exige encriptação KMS obrigatória em datastores.
- **Máquina de Estados Finitos Imutável (RN-05):** Ciclo de vida determinístico para stacks de infraestrutura:
  $$\text{DRAFT} \longrightarrow \text{VALIDATING} \longrightarrow \text{PLAN\_READY} \longrightarrow \text{APPLYING} \longrightarrow \text{PROVISIONED}$$
  Com estados de tratamento para `DRIFTED`, `FAILED` e `DESTROYED`.

---

## 📐 Matriz de Invariantes de Domínio

| Código | Invariante | Descrição Executiva |
|---|---|---|
| **RN-01** | **FinOps Budget Integrity** | Orçamento mensal e custos mensurados exclusivamente em centavos inteiros com trava atômica de teto e alerta em 80%. |
| **RN-02** | **CIDR Anti-Collision** | Subnets com blocos sobrepostos na mesma stack disparam `CidrCollisionError` antes de qualquer plano ser gerado. |
| **RN-03** | **Canonical Cloud URN** | Recursos indexados por URNs padronizados com validação estrita de provedor (`aws`, `gcp`, `azure`, `k8s`). |
| **RN-04** | **CIS Security Enforcement** | Bloqueio de portas restritas (22, 3389, 5432, 9092) para `0.0.0.0/0` e obrigatoriedade de KMS em armazenamento. |
| **RN-05** | **Finite State Machine (FSM)** | Transições de estado determinísticas com rastreabilidade auditável e emissão de eventos de domínio. |

---

## 📅 Roadmap Evolutivo (Sprint 06)

- [x] **Fase 1 (Kickoff & Domínio v1.0.0):** Modelagem DDD, Value Objects `CidrBlock`, `CloudResourceUrn`, `FinOpsBudget`, `SecurityRule`, Agregado `InfrastructureStack`, FSM e 23 testes unitários (100% pass).
- [ ] **Fase 2 (Persistência ACID & State Locking v1.1.0):** Repositório de estado com snapshot, Lock Manager distribuído anti-concorrência de apply e Unit of Work.
- [ ] **Fase 3 (Mensageria & Drift Detection Relay v1.2.0):** Transactional Outbox, webhooks criptográficos HMAC para alertas de drift e integração com brokers de eventos.
- [ ] **Fase 4 (Cockpit Operacional & Telemetria v1.3.0):** Telemetry Collector, histogramas de latência de provisionamento, health probes liveness/readiness e console executivo.
- [ ] **Fase 5 (Hardening, Benchmark & Chaos v1.4.0):** Benchmark de alta vazão ($\ge 5.000$ ops/s), injeção de caos em I/O e release estabilizada.

---

## 🧪 Executando os Testes Nativos

```bash
# Compilar TypeScript
npm run build

# Executar bateria de testes nativos
npm test
```
