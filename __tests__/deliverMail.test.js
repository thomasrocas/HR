const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

describe('deliverMail SendGrid integration', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    if (ORIGINAL_FETCH) {
      global.fetch = ORIGINAL_FETCH;
    } else {
      delete global.fetch;
    }
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses SendGrid via undici fetch when global fetch is unavailable', async () => {
    jest.resetModules();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    jest.doMock('undici', () => ({ fetch: fetchMock }), { virtual: true });

    process.env = {
      ...ORIGINAL_ENV,
      SENDGRID_API_KEY: 'test-key',
      SENDGRID_FROM_EMAIL: 'from@example.com',
    };
    delete process.env.SMTP_URL;

    delete global.fetch;

    const { deliverMail } = require('../orientation_server');

    await deliverMail({
      to: 'user@example.com',
      subject: 'Hi there',
      text: 'Hello from tests',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    const body = JSON.parse(options.body);
    expect(body.from.email).toBe('from@example.com');
  });

  it('surfaces SendGrid delivery failures when no SMTP transport is configured', async () => {
    jest.resetModules();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('upstream failure'),
    });
    jest.doMock('undici', () => ({ fetch: fetchMock }), { virtual: true });

    const sendMailMock = jest.fn().mockResolvedValue();
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
    }));

    process.env = {
      ...ORIGINAL_ENV,
      SENDGRID_API_KEY: 'test-key',
      SENDGRID_FROM_EMAIL: 'from@example.com',
    };
    delete process.env.SMTP_URL;

    delete global.fetch;

    const { deliverMail } = require('../orientation_server');

    await expect(deliverMail({
      to: 'user@example.com',
      subject: 'Failure scenario',
      text: 'This should error',
    })).rejects.toThrow('sendgrid_error_500');

    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
