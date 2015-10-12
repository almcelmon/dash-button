jest.dontMock('../DashButton');

let events = require('events');

describe('DashButton', () => {
  const MAC_ADDRESS = '00:11:22:33:44:55';
  const NETWORK_INTERFACE = 'en0';

  let pcap;
  let DashButton;
  let NetworkInterfaces;

  beforeEach(() => {
    DashButton = require('../DashButton');

    pcap = require('pcap');
    NetworkInterfaces = require('../NetworkInterfaces');

    pcap.createSession.mockImplementation(() => createMockPcapSession());
    NetworkInterfaces.getDefault.mockReturnValue(NETWORK_INTERFACE);
  });

  it(`creates a pcap session the first time a listener is added`, () => {
    let button = new DashButton(MAC_ADDRESS);
    button.addListener(() => {});

    expect(pcap.createSession.mock.calls.length).toBe(1);
  });

  it(`shares pcap sessions amongst buttons`, () => {
    let button1 = new DashButton(MAC_ADDRESS);
    button1.addListener(() => {});

    let button2 = new DashButton('66:77:88:99:aa:bb');
    button2.addListener(() => {});

    expect(pcap.createSession.mock.calls.length).toBe(1);
  });

  it(`notifies the appropriate listeners for each packet`, () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button1Listener = jest.genMockFunction();
    let button2Listener = jest.genMockFunction();

    let button1 = new DashButton(MAC_ADDRESS);
    button1.addListener(button1Listener);
    let button2 = new DashButton('66:77:88:99:aa:bb');
    button2.addListener(button2Listener);

    // TODO: emit a mock packet and assert that the button listeners are/aren't called
    let packet = null;
    mockSession.emit('packet', packet);
    expect(button1Listener.mock.calls.length).toBe(1);
    // expect(button2Listener.mock.calls.length).toBe(0);
  });

  pit(`waits for listeners for a prior packet to asynchronously complete ` +
     `before handling any new packets`, async () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button = new DashButton(MAC_ADDRESS);
    let calls = 0;
    button.addListener(() => { calls++; });

    let packet = null;
    mockSession.emit('packet', packet);
    expect(calls).toBe(1);
    mockSession.emit('packet', packet);
    expect(calls).toBe(1);
    await Promise.resolve();
    mockSession.emit('packet', packet);
    expect(calls).toBe(2);
  });

  pit(`waits for all listeners even if some threw an error`, async () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button = new DashButton(MAC_ADDRESS);
    let errorCount = 0;
    button.addListener(() => {
      errorCount++;
      throw new Error('Intentional sync error');
    });
    button.addListener(() => {
      errorCount++;
      return Promise.reject(new Error('Intentional async error'));
    });

    let listenerPromise;
    button.addListener(() => {
      listenerPromise = async () => {
        // Wait for the other listeners to throw
        await Promise.resolve();
        expect(errorCount).toBe(2);
        await Promise.resolve();
        return 'success';
      }();
      return listenerPromise;
    });

    let packet = null;
    expect(listenerPromise).not.toBeDefined();
    mockSession.emit('packet', packet);
    expect(listenerPromise).toBeDefined();
    let result = await listenerPromise;
    expect(result).toBe('success');
  });

  it(`runs its async listeners concurrently`, () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button = new DashButton(MAC_ADDRESS);
    let calls = 0;
    button.addListener(async () => {
      calls++;
      await Promise.resolve();
    });
    button.addListener(async () => {
      calls++;
      await Promise.resolve();
    });

    let packet = null;
    expect(calls).toBe(0);
    mockSession.emit('packet', packet);
    expect(calls).toBe(2);
  });

  it(`removes packet listeners when a button has no more listeners`, () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button = new DashButton(MAC_ADDRESS);
    let subscription1 = button.addListener(() => {});
    let subscription2 = button.addListener(() => {});
    expect(mockSession.listenerCount('packet')).toBe(1);

    subscription1.remove();
    expect(mockSession.listenerCount('packet')).toBe(1);
    subscription2.remove();
    expect(mockSession.listenerCount('packet')).toBe(0);
  });

  it(`doesn't throw if you remove a subscription twice`, () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button = new DashButton(MAC_ADDRESS);
    let subscription = button.addListener(() => {});

    subscription.remove();
    expect(mockSession.listenerCount('packet')).toBe(0);
    expect(::subscription.remove).not.toThrow();
  });

  it(`closes the pcap session when no more buttons are listening`, () => {
    let mockSession = createMockPcapSession();
    pcap.createSession.mockReturnValue(mockSession);

    let button1Listener = jest.genMockFunction();
    let button2Listener = jest.genMockFunction();

    let button1 = new DashButton(MAC_ADDRESS);
    let subscription1 = button1.addListener(button1Listener);
    let button2 = new DashButton('66:77:88:99:aa:bb');
    let subscription2 = button2.addListener(button2Listener);

    subscription1.remove();
    expect(mockSession.close.mock.calls.length).toBe(0);
    subscription2.remove();
    expect(mockSession.close.mock.calls.length).toBe(1);
  });
});

function createMockPcapSession() {
  let session = new events.EventEmitter();
  session.close = jest.genMockFunction();
  return session;
}
