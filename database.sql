-- ==============================================
-- DataKonsulent.no – Databaseskjema
-- Passord for alle brukere: "passord"
-- ==============================================

CREATE TABLE bedrift (
    bedrift_id      SERIAL PRIMARY KEY,
    navn            VARCHAR(255) NOT NULL,
    organisasjonsnr VARCHAR(20) UNIQUE NOT NULL,
    adresse         VARCHAR(255),
    postnummer      VARCHAR(10),
    poststed        VARCHAR(100)
);

CREATE TABLE tjeneste (
    tjeneste_id  SERIAL PRIMARY KEY,
    navn         VARCHAR(255) NOT NULL,
    beskrivelse  TEXT,
    pris_per_mnd DECIMAL(10,2) NOT NULL
);

CREATE TABLE kontaktperson (
    kontakt_id SERIAL PRIMARY KEY,
    bedrift_id INT NOT NULL REFERENCES bedrift(bedrift_id) ON DELETE CASCADE,
    fornavn    VARCHAR(100) NOT NULL,
    etternavn  VARCHAR(100) NOT NULL,
    epost      VARCHAR(255),
    telefon    VARCHAR(30),
    stilling   VARCHAR(150)
);

CREATE TABLE bedrifttjeneste (
    bedrift_id  INT NOT NULL REFERENCES bedrift(bedrift_id) ON DELETE CASCADE,
    tjeneste_id INT NOT NULL REFERENCES tjeneste(tjeneste_id) ON DELETE CASCADE,
    startdato   DATE NOT NULL,
    sluttdato   DATE,
    aktiv       BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (bedrift_id, tjeneste_id)
);

-- Bruker: role = 'admin' | 'ansatt' | 'kunde'
-- Kunder kobles til én bedrift via bedrift_id
CREATE TABLE bruker (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'ansatt',
    bedrift_id    INT REFERENCES bedrift(bedrift_id) ON DELETE SET NULL
);

-- ---- Eksempeldata ----

INSERT INTO bedrift (navn, organisasjonsnr, adresse, postnummer, poststed) VALUES
('TechStart AS', '912345678', 'Storgata 1',   '0155', 'Oslo'),
('NordNett AS',  '923456789', 'Parkveien 12', '0350', 'Oslo');

INSERT INTO tjeneste (navn, beskrivelse, pris_per_mnd) VALUES
('Serverdrift',         'Overvåking og drift av servere', 4500.00),
('Sikkerhetskopiering', 'Daglig backup av data',          1200.00),
('Brukerstøtte',        'Helpdesk support månedlig',      2000.00);

INSERT INTO kontaktperson (bedrift_id, fornavn, etternavn, epost, telefon, stilling) VALUES
(1, 'Kari', 'Olsen',  'kari@techstart.no', '90012345', 'IT-leder'),
(2, 'Per',  'Hansen', 'per@nordnett.no',   '91123456', 'Daglig leder');

INSERT INTO bedrifttjeneste (bedrift_id, tjeneste_id, startdato) VALUES
(1, 1, '2025-01-01'),
(1, 2, '2025-01-01'),
(2, 1, '2025-03-01'),
(2, 3, '2025-03-01');

-- Alle passord er "passord" (bcrypt hash)
INSERT INTO bruker (username, password_hash, role, bedrift_id) VALUES
('admin',     '$2b$10$4KF6tAgQ.ei34q4/h3iWq.tEypWv61u7o9bSZeMyHJ1UjSfXvjlti', 'admin',  NULL),
('ansatt',    '$2b$10$4KF6tAgQ.ei34q4/h3iWq.tEypWv61u7o9bSZeMyHJ1UjSfXvjlti', 'ansatt', NULL),
('techstart', '$2b$10$4KF6tAgQ.ei34q4/h3iWq.tEypWv61u7o9bSZeMyHJ1UjSfXvjlti', 'kunde',  1),
('nordnett',  '$2b$10$4KF6tAgQ.ei34q4/h3iWq.tEypWv61u7o9bSZeMyHJ1UjSfXvjlti', 'kunde',  2);
